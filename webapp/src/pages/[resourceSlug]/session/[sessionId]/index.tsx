import {
	StopIcon,
} from '@heroicons/react/24/outline';
import debug from 'debug';
import Head from 'next/head';
import { useRouter } from 'next/router';
import React, { useEffect, useRef, useState } from 'react';
import Blockies from 'react-blockies';
import { SessionStatus } from 'struct/session';

// import { useParams } from 'next/navigation';
import * as API from '../../../../api';
import { Message } from '../../../../components/chat/message';
import classNames from '../../../../components/ClassNames';
import SessionChatbox from '../../../../components/SessionChatbox';
import { useAccountContext } from '../../../../context/account';
import { useChatContext } from '../../../../context/chat';
import { useSocketContext } from '../../../../context/socket';
const log = debug('webapp:socket');

export default function Session(props) {

	const [accountContext]: any = useAccountContext();
	const { account, csrf } = accountContext as any;
	const router = useRouter();
	const { resourceSlug } = router.query;
	const [state, dispatch] = useState(props);
	const [ready, setReady] = useState(false);
	const [lastSeenMessageId, setLastSeenMessageId] = useState(null);
	const [error, setError] = useState();
	// @ts-ignore
	const { sessionId } = router.query && router.query.sessionId.startsWith('[') ? props.query : router.query;
	const { session } = state;
	const scrollContainerRef = useRef(null);
	const [_chatContext, setChatContext]: any = useChatContext();
	const [socketContext]: any = useSocketContext();
	const [messages, setMessages] = useState(null);
	const [terminated, setTerminated] = useState(null);
	const [isAtBottom, setIsAtBottom] = useState(true);
	useEffect(() => {
		if (!scrollContainerRef || !scrollContainerRef.current) { return; }
		const handleScroll = (e) => {
			const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
			// Check if scrolled to the bottom
			const isCurrentlyAtBottom = scrollTop + clientHeight >= (scrollHeight - 10);
			if (isCurrentlyAtBottom !== isAtBottom) {
				setIsAtBottom(isCurrentlyAtBottom);
				if (isCurrentlyAtBottom && messages?.length > 0) {
					setLastSeenMessageId(messages[messages.length-1]._id);
				}
			}
		};
		const container = scrollContainerRef.current;
		container.addEventListener('scroll', handleScroll);
		// Cleanup
		return () => {
			container.removeEventListener('scroll', handleScroll);
		};
	}, [isAtBottom, scrollContainerRef?.current]);
	const sentLastMessage = !messages || (messages.length > 0 && messages[messages.length-1].incoming);
	const lastMessageFeedback = !messages || (messages.length > 0 && messages[messages.length-1].isFeedback);
	const chatBusyState = sentLastMessage || !lastMessageFeedback;
	async function joinSessionRoom() {
		socketContext.emit('join_room', sessionId);
	}
	async function leaveSessionRoom() {
		socketContext.emit('leave_room', sessionId);
	}
	function handleTerminateMessage(message) {
		log('Received terminate message %s', message);
		setTerminated(true);
	}
	// console.log('lastSeenMessageId', lastSeenMessageId);
	function handleSocketMessage(message) {
		// console.log('Received chat message %O', JSON.stringify(message, null, 2));
		if (!message) { return; }
		if (isAtBottom) {
			setLastSeenMessageId(message._id);
		}
		const newMessage = typeof message === 'string'
			? { type: null, text: message }
			: message;
		setMessages(oldMessages => {
			// There are existing messages
			const matchingMessage = oldMessages.find(m => m?.message?.chunkId != undefined && m?.message?.chunkId === message?.message?.chunkId
				&& m?.authorName === message?.authorName);
			console.log(message?.message?.chunkId, `'${newMessage.message.text}'`, 'matching', matchingMessage != undefined);
			if (matchingMessage && message?.incoming !== true) {
				const newChunk = { chunk: message.message.text, ts: message.ts, tokens: message?.message?.tokens };
				const newChunks = (matchingMessage?.chunks||[{ ts: 0, chunk: matchingMessage.message.text || '' }])
					.concat([newChunk])
					.sort((ma, mb) => ma.ts - mb.ts);
				matchingMessage.chunks = newChunks;
				matchingMessage.message.text = newChunks.map(c => c.chunk).join('');
				return [...oldMessages];
			}
			return oldMessages
				.concat([newMessage])
				.sort((ma, mb) => ma.ts - mb.ts);
		});
	}
	function handleSocketStatus(status) {
		log('Received chat status %s', status);
		if (!status) { return; }
		setChatContext({
			status,
		});
	}
	function handleSocketType(type) {
		log('Received chat type %s', type);
		if (!type) { return; }
		setChatContext({
			type,
		});
	}
	function handleSocketTokens(tokens) {
		log('Received chat type %s', tokens);
		if (!tokens) { return; }
		setChatContext({
			tokens,
		});
	}
	function scrollToBottom(behavior: string='instant') {
		//scroll to bottom when messages added (if currently at bottom)
		if (scrollContainerRef && scrollContainerRef.current && isAtBottom) {
			scrollContainerRef.current.scrollTo({
				left: 0,
				top: scrollContainerRef.current.scrollHeight,
				behavior,
			});
		}
	}
	useEffect(() => {
		scrollToBottom();
	}, [messages]);
	function sendFeedbackMessage(message: string, options?: { displayMessage?: string }) {
		socketContext.emit('message', {
			room: sessionId,
			authorName: account.name,
			incoming: true,
			displayMessage: options && options.displayMessage,
			message: {
				type: 'text',
				text: message,
			}
		});
	}
	function handleSocketJoined(joinMessage) {
		log('Received chat joined %s', joinMessage);
		scrollToBottom();
	}
	function handleSocketStart() {
		socketContext.on('connect', joinSessionRoom);
		socketContext.on('reconnect', joinSessionRoom);
		socketContext.on('terminate', handleTerminateMessage);
		socketContext.on('message', handleSocketMessage);
		socketContext.on('status', handleSocketStatus);
		socketContext.on('tokens', handleSocketTokens);
		socketContext.on('type', handleSocketType);
		socketContext.on('joined', handleSocketJoined);
		joinSessionRoom();
	}
	function handleSocketStop() {
		socketContext.off('connect', joinSessionRoom);
		socketContext.off('reconnect', joinSessionRoom);
		socketContext.off('terminate', handleTerminateMessage);
		socketContext.off('message', handleSocketMessage);
		socketContext.off('status', handleSocketStatus);
		socketContext.off('tokens', handleSocketTokens);
		socketContext.off('type', handleSocketType);
		socketContext.off('joined', handleSocketJoined);
		leaveSessionRoom();
	}
	useEffect(() => {
		if (session) {
			setTerminated(session.status === SessionStatus.TERMINATED);
		}
	}, [session]);
	useEffect(() => {
		API.getSession({
			resourceSlug,
			sessionId,
		}, (res) => {
			dispatch(res);
			if (res && res?.session) {
				setChatContext({
					prompt: res.session.prompt,
					status: res.session.status,
					type: res.session.type,
					tokens: res.session.tokensUsed,
					scrollToBottom,
				});
			}
		}, setError, router);
		API.getMessages({
			resourceSlug,
			sessionId,
		}, (_messages) => {
			const sortedMessages = _messages
				.map(m => {
					const _m = m.message;
					const combinedChunks = (m.chunks||[])
						.sort((ca, cb) => ca.ts - cb.ts)
						.map(x => x.chunk)
						.join('');
					if (combinedChunks?.length > 0) {
						_m.message.text = (_m.message.chunkId && _m.message.text.length > 0 ? _m.message.text : '') + combinedChunks;
					}
					_m.tokens = m.tokens || _m.tokens;
					_m._id = m._id; //id for last seen
					return _m;
				})
				.sort((ma, mb) => ma.ts - mb.ts);
			if (sortedMessages && sortedMessages.length > 0) {
				setLastSeenMessageId(sortedMessages[sortedMessages.length-1]._id);
			}
			setMessages(sortedMessages);
		}, setError, router);
	}, [resourceSlug, router?.query?.sessionId]);
	useEffect(() => {
		if (ready) {
			console.log('useEffect ready check handleSocketStart()');
			handleSocketStart();
		}
		return () => {
			//stop/disconnect on unmount
			console.log('useEffect ready check handleSocketStop()');
			handleSocketStop();
		};
	}, [ready]);
	useEffect(() => {
		if (messages && messages.length > 0 && ready === false) {
			console.log('useEffect messages check setReady(true)');
			setReady(true);
		}
	}, [messages]);

	function stopGenerating() {
		socketContext.emit('stop_generating', {
			room: sessionId,
		});
	}

	function sendMessage(e, reset) {
		e.preventDefault();
		const message: string = e.target.prompt ? e.target.prompt.value : e.target.value;
		if (!message || message.trim().length === 0) { return null; }
		socketContext.emit('message', {
			room: sessionId,
			authorName: account.name,
			incoming: true,
			message: {
				type: 'text',
				text: message,
			}
		});
		reset && reset();
		return true;
	}

	if (!session || messages == null) {
		return 'Loading...'; //TODO: loader
	}

	return (
		<>

			<Head>
				<title>Session - {sessionId}</title>
			</Head>

			<div className='flex flex-col -mx-3 sm:-mx-6 lg:-mx-8 -my-10 flex flex-col flex-1' style={{ maxHeight: 'calc(100vh - 110px)' }}>

				<div className='overflow-y-auto' ref={scrollContainerRef}>
					{messages && messages.map((m, mi, marr) => {
						return <Message
							key={`message_${mi}`}
							prevMessage={mi > 0 ? marr[mi-1] : null}
							message={m?.message?.text}
							messageType={m?.message?.type}
							messageLanguage={m?.message?.language}
							authorName={m?.authorName}
							feedbackOptions={m?.options}
							incoming={m?.incoming}
							ts={m?.ts}
							isFeedback={m?.isFeedback}
							isLastMessage={mi === marr.length-1}
							isLastSeen={false /*lastSeenMessageId && lastSeenMessageId === m?._id*/}
							sendMessage={sendFeedbackMessage}
							displayMessage={m?.displayMessage || m?.message?.displayMessage}
							tokens={(m?.chunks ? m.chunks.reduce((acc, c) => { return acc + (c.tokens || 0); }, 0) : 0) + (m?.tokens || m?.message?.tokens || 0)}
							chunking={m?.chunks?.length > 0 && mi === marr.length-1}
						/>;
					})}
					{chatBusyState && !terminated && <div className='text-center border-t pb-6 pt-8 dark:border-slate-600'>
						<span className='inline-block animate-bounce ad-100 h-4 w-2 mx-1 rounded-full bg-indigo-600 opacity-75'></span>
						<span className='inline-block animate-bounce ad-300 h-4 w-2 mx-1 rounded-full bg-indigo-600 opacity-75'></span>
						<span className='inline-block animate-bounce ad-500 h-4 w-2 mx-1 rounded-full bg-indigo-600 opacity-75'></span>
					</div>}
				</div>

				<div className='flex flex-col mt-auto'>
					<div className='flex flex-row justify-center border-t pt-3 dark:border-slate-600'>
						{chatBusyState && !terminated && <div className='flex items-end basis-1/2'>
							<button
								onClick={() => stopGenerating()}
								type='submit'
								className={'whitespace-nowrap pointer-events-auto inline-flex items-center rounded-md ms-auto mb-2 px-3 ps-2 py-2 text-sm font-semibold text-white shadow-sm bg-indigo-600 hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600'}
							>
								<StopIcon className={'w-5 me-1'} />
								<span>Cancel</span>
							</button>
						</div>}
					</div>
					<div className='flex flex-row justify-center pb-3'>
						<div className='flex items-start space-x-4 basis-1/2'>
							{!terminated && <div className='min-w-max w-9 h-9 rounded-full flex items-center justify-center select-none'>
								<span className={'overflow-hidden w-8 h-8 rounded-full text-center font-bold ring-gray-300 ring-1'}>
									<Blockies seed={account.name} />
								</span>
							</div>}
							<div className='min-w-0 flex-1 h-full'>
								{terminated 
									? <p id='session-terminated' className='text-center h-full me-14 pt-3'>This session was terminated.</p>
									: <SessionChatbox
										scrollToBottom={scrollToBottom}
										lastMessageFeedback={lastMessageFeedback}
										chatBusyState={chatBusyState}
										onSubmit={sendMessage} />}
							</div>
						</div>
					</div>
				</div>

			</div>

		</>
	);

};

export async function getServerSideProps({ req, res, query, resolvedUrl, locale, locales, defaultLocale }) {
	return JSON.parse(JSON.stringify({ props: res?.locals?.data || {} }));
};
