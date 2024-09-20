import { WebSocket } from 'ws';
import { handleMessage } from './messageHandler';
import {
  getAvailableEmbeddingModelProviders,
  getAvailableChatModelProviders,
} from '../lib/providers';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Embeddings } from '@langchain/core/embeddings';
import type { IncomingMessage } from 'http';
import logger from '../utils/logger';
import { ChatOpenAI } from '@langchain/openai';

export const handleConnection = async (
  ws: WebSocket,
  request: IncomingMessage,
) => {
  try {
    logger.debug('CM-1: 开始处理WebSocket连接');
    const searchParams = new URL(request.url, `http://${request.headers.host}`)
      .searchParams;

    logger.debug('CM-2: 获取模型提供者');
    const [chatModelProviders, embeddingModelProviders] = await Promise.all([
      getAvailableChatModelProviders(),
      getAvailableEmbeddingModelProviders(),
    ]);

    const chatModelProvider =
      searchParams.get('chatModelProvider') ||
      Object.keys(chatModelProviders)[0];
    const chatModel =
      searchParams.get('chatModel') ||
      Object.keys(chatModelProviders[chatModelProvider])[0];

    const embeddingModelProvider =
      searchParams.get('embeddingModelProvider') ||
      Object.keys(embeddingModelProviders)[0];
    const embeddingModel =
      searchParams.get('embeddingModel') ||
      Object.keys(embeddingModelProviders[embeddingModelProvider])[0];

    let llm: BaseChatModel | undefined;
    let embeddings: Embeddings | undefined;

    logger.debug('CM-3: 初始化LLM和嵌入模型');
    if (
      chatModelProviders[chatModelProvider] &&
      chatModelProviders[chatModelProvider][chatModel] &&
      chatModelProvider != 'custom_openai'
    ) {
      llm = chatModelProviders[chatModelProvider][chatModel] as unknown as
        | BaseChatModel
        | undefined;
    } else if (chatModelProvider == 'custom_openai') {
      llm = new ChatOpenAI({
        modelName: chatModel,
        openAIApiKey: searchParams.get('openAIApiKey'),
        temperature: 0.7,
        configuration: {
          baseURL: searchParams.get('openAIBaseURL'),
        },
      }) as unknown as BaseChatModel;
    }

    if (
      embeddingModelProviders[embeddingModelProvider] &&
      embeddingModelProviders[embeddingModelProvider][embeddingModel]
    ) {
      embeddings = embeddingModelProviders[embeddingModelProvider][
        embeddingModel
      ] as Embeddings | undefined;
    }

    if (!llm || !embeddings) {
      ws.send(
        JSON.stringify({
          type: 'error',
          data: 'Invalid LLM or embeddings model selected, please refresh the page and try again.',
          key: 'INVALID_MODEL_SELECTED',
        }),
      );
      ws.close();
    }

    logger.debug('CM-4: 设置WebSocket事件监听器');
    ws.on(
      'message',
      async (message) =>
        await handleMessage(message.toString(), ws, llm, embeddings),
    );

    ws.on('close', () => logger.debug('CM-5: 连接关闭'));
  } catch (err) {
    logger.error(`CM-ERR: WebSocket连接处理错误: ${err}`);
    ws.send(
      JSON.stringify({
        type: 'error',
        data: 'Internal server error.',
        key: 'INTERNAL_SERVER_ERROR',
      }),
    );
    ws.close();
  }
};
