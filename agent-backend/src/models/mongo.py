from dataclasses import field
from typing import Any, Dict, List, Optional, Union, Callable
from random import randint
from pydantic import BaseModel, BeforeValidator, Field
from enum import Enum
from typing import Annotated

# Represents an ObjectId field in the database.
# It will be represented as a `str` on the model so that it can be serialized to JSON.
PyObjectId = Annotated[str, BeforeValidator(str)]


class ToolType(str, Enum):
    API_TOOL = "api"
    HOSTED_FUNCTION_TOOL = "function"


class FunctionProperty(BaseModel):
    type: Union[str, int, float, bool, None]
    description: str


class ToolParameters(BaseModel):
    type: str
    properties: Dict[str, FunctionProperty]
    required: List[str]


class ToolData(BaseModel):
    description: str
    parameters: ToolParameters
    name: str
    code: str
    builtin: bool


class DatasourceData(BaseModel):
    id: str
    model: str


class Platforms(str, Enum):
    OpenAI = "open_ai"
    Azure = "azure"


class Models(str, Enum):
    GPT4 = "gpt-4"
    GPT4TURBO = "gpt-4-1106-preview"
    GPT3TURBO = "gpt-3.5-turbo"


class ConfigList(BaseModel):
    """Data model for OpenAi Model Config"""

    api_key: Optional[str] = ""
    api_type: Optional[Platforms] = Platforms.OpenAI
    model: Optional[Models] = Models.GPT4
    timeout: Optional[int] = 300
    max_retries: Optional[int] = 10


class LLMConfig(BaseModel):
    """Data model for Autogen  LLMConfig"""

    seed: Optional[int] = randint(1, 100)
    config_list: List[ConfigList] = field(default_factory=list)
    temperature: Optional[float] = 0
    timeout: Optional[int] = 300
    max_retries: Optional[int] = 10
    stream: Optional[bool] = True
    functions: Optional[List[ToolData]] = None


class RetrieverData(BaseModel):
    task: str = "qa"
    collection_name: str
    chunk_token_size: int = 2000
    embedding_model: str
    model: str
    client: Optional[object] = None


class AgentConfig(BaseModel):
    """Data model for Autogen Agent Config"""

    name: str
    llm_config: LLMConfig
    human_input_mode: Optional[str] = "NEVER"
    system_message: Optional[str] = ""
    max_consecutive_auto_reply: Optional[int] = 10
    is_termination_msg: Union[Callable, str] = lambda x: x.get("content", "") and x.get(
        "content", ""
    ).rstrip().endswith("TERMINATE")
    code_execution_config: Optional[Union[bool, str, Dict[str, Any]]] = {}
    use_sockets: Optional[bool] = True
    socket_client: Any = None
    sid: str = None
    datasource_data: Optional[List[DatasourceData]] = None
    datasource_ids: Optional[List[str]] = None
    # retrieve_config: Optional[Dict[str, Any]] = None
    retrieve_config: Optional[RetrieverData] = None
    debug_docs: Optional[bool] = False


AgentConfigArgs = tuple([k for k in AgentConfig.model_fields.keys()])


class AgentTypes(str, Enum):
    AssistantAgent = "AssistantAgent"
    UserProxyAgent = "UserProxyAgent"
    RetrieverUserProxyAgent = "RetrieverUserProxyAgent"
    RetrieverAssistantProxyAgent = "RetrieverAssistantProxyAgent"
    TeachableAgent = "TeachableAgent"


class AgentData(BaseModel):
    data: AgentConfig
    type: str
    is_admin: Optional[bool] = False


class Datasource(BaseModel):
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    orgId: Optional[PyObjectId] = Field(default=None)
    teamId: Optional[PyObjectId] = Field(default=None)
    name: str
    sourceId: str
    sourceType: str
    workspaceId: str
    connectionId: str
    destinationId: str
