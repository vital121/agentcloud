import logging
import inspect
from socketio.simple_client import SimpleClient
from init.env_variables import SOCKET_URL, BASE_PATH, AGENT_BACKEND_SOCKET_TOKEN, LOCAL, QDRANT_HOST
import autogen
from typing import Optional, Union, List, Dict, Callable
from models.mongo import AgentConfig, AgentConfigArgs
from importlib import import_module
from agents.agents_list import AvailableAgents
import qdrantClient.qdrant_connection as qdc
from agents.qdrant_retrieval import map_fastembed_query_model_name


# TODO: Need to make this more modular so that a team can be constructed that included an agent that has an LLMConfig of
# tha function definition and another agent that has no LLMConfig but has the function registered in their func_map


class ChatBuilder:
    def __init__(
            self,
            prompt,
            session_id: str,
            group: dict,
            single_agent: bool,
            history: Optional[dict],
    ):
        self.user_proxy: Optional[Union[autogen.UserProxyAgent, autogen.QdrantRetrieveUserProxyAgent]] = None
        self.agents: Optional[
            List[Union[
                autogen.AssistantAgent, autogen.UserProxyAgent, autogen.RetrieveAssistantAgent, autogen.QdrantRetrieveUserProxyAgent]]
        ] = list()
        self.single_agent = single_agent
        self.group = group
        self.prompt: str = prompt
        self.history: Optional[dict] = history
        self.group_chat: bool = group.get("group_chat") if group else False
        self.function_map = dict()

        # Initialize the socket client and connect
        self.socket = SimpleClient()
        self.session_id = session_id
        custom_headers = {"x-agent-backend-socket-token": AGENT_BACKEND_SOCKET_TOKEN}
        self.socket.connect(url=SOCKET_URL, headers=custom_headers)
        self.socket.emit("join_room", f"_{session_id}")

    def build_function_map(self):
        for agent in self.agents:
            agent_config: Dict = agent.llm_config
            if agent_config and len(agent_config) > 0:
                functions: List[Dict] = agent_config.get("functions")
                if functions and len(functions) > 0:
                    for function in functions:
                        if not function.get("builtin"):
                            func_name: str = f"{function.get('name')}"
                            func_code: str = function.get("code")
                            self.function_map.update({func_name: func_code})

        self.write_function_code_to_file()

    def write_function_code_to_file(self):
        try:
            if self.function_map and len(self.function_map) > 0:
                functions = "\n".join([v + "\n" for v in self.function_map.values()])
                if functions and len(functions) > 0:
                    with open(f"{BASE_PATH}/tools/{self.session_id}.py", "w") as f:
                        f.write(functions)
        except Exception as e:
            logging.exception(e)

    def attach_tools_to_agent(self):
        try:
            self.build_function_map()
            for i, agent in enumerate(self.agents):
                agent_config: Dict = agent.llm_config
                if agent_config and len(agent_config) > 0:
                    functions: List[Dict] = agent_config.get("functions")
                    if functions and len(functions) > 0:
                        for function in functions:
                            func_name: str = f"{function.get('name')}"
                            module_path = "tools.global_tools"
                            if (
                                    not function.get("builtin")
                                    and len(function.get("code", "")) > 0
                            ):
                                module_path = f"tools.{self.session_id}"
                            try:
                                # Import the function from the tools directory
                                module = import_module(module_path)
                                func: Callable = getattr(module, func_name)
                                # Register function associated with agent
                                agent.register_function(
                                    function_map={
                                        func_name: func,
                                    }
                                )
                            except ModuleNotFoundError as mnf:
                                logging.exception(mnf)
                                pass
                            # Remove built and code variables it as it is a system variable and does not need to be passed to autogen
                            function.pop("code")
                            function.pop("builtin")
                            self.agents[i] = agent
        except Exception as e:
            logging.exception(e)

    def add_datasource_retrievers(self, retriver_model_data):
        # print(retriver_model_data)
        # for role in self.group["roles"]:
        # agent_config = role.get("data")
        # if "datasource_data" in agent_config  and len(agent_config["datasource_data"]) > 0:
        # for datasource in agent_config["datasource_data"]:
        datasource = retriver_model_data["datasource_data"][0]
        print(f"datasource: {datasource}")
        agent = apply_agent_config(AvailableAgents.QdrantRetrieveUserProxyAgent, {
            "retrieve_config": {
                "task": "qa",
                "collection_name": datasource["id"],
                "chunk_token_size": 2000,
                "client": qdc.get_connection(host=QDRANT_HOST, port=6333),
                # "embedding_model": "BAII/bge-small-en",
                "embedding_model": map_fastembed_query_model_name(datasource["model"]),
                "model": retriver_model_data["llm_config"]["config_list"][0]["model"].value,
                # "type": None,
            },
            # "model": "gpt-4",
            # "type": None,
            "name": "admin",
            "human_input_mode": "ALWAYS",
            "max_consecutive_auto_reply": 10,
            "llm_config": retriver_model_data["llm_config"],
            "use_sockets": True,
            "socket_client": self.socket,
            "sid": self.session_id,
            "code_execution_config": False,
            "debug_docs": LOCAL
        })
        # self.agents.append(agent)
        self.user_proxy = agent

    def process_role(self, role):
        agent_type = getattr(AvailableAgents, role.get("type"))
        agent_config = role.get("data")
        agent_config["name"] = (
            "admin" if role.get("is_admin") else agent_config.get("name")
        )
        agent_config["socket_client"] = self.socket
        agent_config["sid"] = self.session_id
        if "retrieve_config" in agent_config and agent_config["retrieve_config"] is not None:
            agent_config["retrieve_config"]["client"] = qdc.get_connection(host=QDRANT_HOST, port=6333)
            agent_config["debug_docs"] = LOCAL  # will print retrieved dos and context verbose
        agent = apply_agent_config(agent_type, agent_config)
        if agent.name == "admin":
            self.user_proxy: autogen.UserProxyAgent = agent
        self.agents.append(agent)

    def create_group(self):
        roles = self.group.get("roles")
        for i, role in enumerate(roles):
            self.process_role(role)

    def add_retrieve_assistant_if_required(self):
        # for agent in self.agents:
        remove_index = -1
        for i in range(0, len(self.agents)):
            agent = self.agents[i]
            if type(agent) is AvailableAgents.QdrantRetrieveUserProxyAgent:
                assistant_agent = apply_agent_config(AvailableAgents.RetrieveAssistantAgent, {
                    "name": "retrieve_assistant_agent",
                    "system_message": "You are a helpful assistant who can answer user questions based on the context provided",
                    "llm_config": agent.llm_config,
                    "use_sockets": True,
                    "socket_client": self.socket,
                    "sid": self.session_id,
                    "code_execution_config": False
                })
                assistant_agent.reset()
                self.agents.append(assistant_agent)
                if self.single_agent:
                    remove_index = i
        if remove_index >= 0:
            del self.agents[remove_index]

    def remove_admin_agent(self):
        self.agents = [agent for agent in self.agents if agent.name != "admin"]

    def run_chat(self):
        # single agent, make non-executing UserProxyAgent
        if self.single_agent:
            if self.user_proxy is None:
                user_proxy = autogen.UserProxyAgent(
                    name=self.agents[0].name,
                    use_sockets=True,
                    socket_client=self.socket,
                    sid=self.session_id,
                )
            else:
                user_proxy = self.user_proxy
                if type(user_proxy) == AvailableAgents.QdrantRetrieveUserProxyAgent:
                    return user_proxy.initiate_chat(
                        recipient=self.agents[0],
                        problem=self.prompt
                    )
            self.agents[0].reset()
            return user_proxy.initiate_chat(
                recipient=self.agents[0],
                message=self.prompt,
                use_sockets=True,
                socket_client=self.socket,
                sid=self.session_id,
            )
        # not single agent
        if self.group_chat:
            groupchat = autogen.GroupChat(
                agents=self.agents,
                messages=[],
                max_round=50,
                allow_repeat_speaker=False,
            )
            # Ensuring all members are aware of their team members
            manager = autogen.GroupChatManager(
                groupchat=groupchat,
                llm_config=self.agents[0].llm_config,
                use_sockets=True,
                socket_client=self.socket,
                sid=self.session_id,
            )
            if self.user_proxy:
                self.user_proxy.initiate_chat(
                    recipient=manager,
                    message=self.prompt,
                    clear_history=True,
                    **self.history,
                )
        else:
            recipient = [agent for agent in self.agents if agent.name != "admin"]
            self.user_proxy.initiate_chat(recipient=recipient[0], message=self.prompt)


def apply_agent_config(agent_class, config_map):
    agent_config_args = AgentConfig(**config_map).model_dump()
    model_keys = list(set(sum(
        [[k for k, v in inspect.signature(a).parameters.items() if "'inspect._empty'" not in str(v.annotation)] for a in
         inspect.getmro(agent_class)], [])))
    for attribute in AgentConfigArgs:
        if attribute not in model_keys:
            del agent_config_args[attribute]
    agent: Union[
        autogen.AssistantAgent, autogen.UserProxyAgent, autogen.RetrieveAssistantAgent, autogen.QdrantRetrieveUserProxyAgent] = agent_class(
        **agent_config_args
    )
    return agent
