import { EventEmitter, WebSocket } from 'ws';
import { BaseMessage, AIMessage, HumanMessage } from '@langchain/core/messages';
import handleWebSearch from '../agents/webSearchAgent';
import handleAcademicSearch from '../agents/academicSearchAgent';
import handleWritingAssistant from '../agents/writingAssistant';
import handleWolframAlphaSearch from '../agents/wolframAlphaSearchAgent';
import handleYoutubeSearch from '../agents/youtubeSearchAgent';
import handleRedditSearch from '../agents/redditSearchAgent';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Embeddings } from '@langchain/core/embeddings';
import logger from '../utils/logger';
import db from '../db';
import { chats, messages } from '../db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

type Message = {
  messageId: string;
  chatId: string;
  content: string;
};

type WSMessage = {
  message: Message;
  copilot: boolean;
  type: string;
  focusMode: string;
  history: Array<[string, string]>;
};

const searchHandlers = {
  webSearch: handleWebSearch,
  academicSearch: handleAcademicSearch,
  writingAssistant: handleWritingAssistant,
  wolframAlphaSearch: handleWolframAlphaSearch,
  youtubeSearch: handleYoutubeSearch,
  redditSearch: handleRedditSearch,
};

const handleEmitterEvents = (
  emitter: EventEmitter,
  ws: WebSocket,
  messageId: string,
  chatId: string,
) => {
  let recievedMessage = '';
  let sources = [];

  emitter.on('data', (data) => {
    const parsedData = JSON.parse(data);
    if (parsedData.type === 'response') {
      ws.send(
        JSON.stringify({
          type: 'message',
          data: parsedData.data,
          messageId: messageId,
        }),
      );
      recievedMessage += parsedData.data;
    } else if (parsedData.type === 'sources') {
      ws.send(
        JSON.stringify({
          type: 'sources',
          data: parsedData.data,
          messageId: messageId,
        }),
      );
      sources = parsedData.data;
    }
  });
  emitter.on('end', () => {
    ws.send(JSON.stringify({ type: 'messageEnd', messageId: messageId }));

    db.insert(messages)
      .values({
        content: recievedMessage,
        chatId: chatId,
        messageId: messageId,
        role: 'assistant',
        metadata: JSON.stringify({
          createdAt: new Date(),
          ...(sources && sources.length > 0 && { sources }),
        }),
      })
      .execute();
  });
  emitter.on('error', (data) => {
    const parsedData = JSON.parse(data);
    ws.send(
      JSON.stringify({
        type: 'error',
        data: parsedData.data,
        key: 'CHAIN_ERROR',
      }),
    );
  });
};

export const handleMessage = async (
  message: string,
  ws: WebSocket,
  llm: BaseChatModel,
  embeddings: Embeddings,
) => {
  try {
    logger.debug('MH-1: 开始处理消息');
    const parsedWSMessage = JSON.parse(message) as WSMessage;
    const parsedMessage = parsedWSMessage.message;

    const id = crypto.randomBytes(7).toString('hex');

    if (!parsedMessage.content) {
      logger.warn('MH-2: 无效的消息格式');
      return ws.send(
        JSON.stringify({
          type: 'error',
          data: 'Invalid message format',
          key: 'INVALID_FORMAT',
        }),
      );
    }

    logger.debug('MH-3: 处理消息历史');
    const history: BaseMessage[] = parsedWSMessage.history.map((msg) => {
      if (msg[0] === 'human') {
        return new HumanMessage({
          content: msg[1],
        });
      } else {
        return new AIMessage({
          content: msg[1],
        });
      }
    });

    if (parsedWSMessage.type === 'message') {
      logger.debug('MH-4: 处理消息类型');
      const handler = searchHandlers[parsedWSMessage.focusMode];

      if (handler) {
        logger.debug('MH-5: 调用处理程序');
        const emitter = handler(
          parsedMessage.content,
          history,
          llm,
          embeddings,
        );

        handleEmitterEvents(emitter, ws, id, parsedMessage.chatId);

        logger.debug('MH-6: 更新数据库');
        const chat = await db.query.chats.findFirst({
          where: eq(chats.id, parsedMessage.chatId),
        });

        if (!chat) {
          await db
            .insert(chats)
            .values({
              id: parsedMessage.chatId,
              title: parsedMessage.content,
              createdAt: new Date().toString(),
              focusMode: parsedWSMessage.focusMode,
            })
            .execute();
        }

        await db
          .insert(messages)
          .values({
            content: parsedMessage.content,
            chatId: parsedMessage.chatId,
            messageId: id,
            role: 'user',
            metadata: JSON.stringify({
              createdAt: new Date(),
            }),
          })
          .execute();
      } else {
        logger.warn('MH-7: 无效的焦点模式');
        ws.send(
          JSON.stringify({
            type: 'error',
            data: 'Invalid focus mode',
            key: 'INVALID_FOCUS_MODE',
          }),
        );
      }
    }
  } catch (err) {
    logger.error(`MH-ERR: 消息处理错误: ${err}`);
    ws.send(
      JSON.stringify({
        type: 'error',
        data: 'Invalid message format',
        key: 'INVALID_FORMAT',
      }),
    );
  }
};
