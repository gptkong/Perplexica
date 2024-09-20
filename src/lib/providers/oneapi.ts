import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { getOneApiKey, getOneApiEndpoint } from '../../config';
import logger from '../../utils/logger';

export const loadOneAPIChatModels = async () => {
  const oneApiKey = getOneApiKey();
  const oneApiEndpoint = getOneApiEndpoint();

  if (!oneApiKey || !oneApiEndpoint) return {};

  try {
    const chatModels = {
      'Doubao-pro-4k': new ChatOpenAI({
        openAIApiKey: oneApiKey,
        configuration: {
          baseURL: oneApiEndpoint,
        },
        modelName: 'Doubao-pro-4k',
        temperature: 0.7,
      }),
      'Doubao-pro-32k': new ChatOpenAI({
        openAIApiKey: oneApiKey,
        configuration: {
          baseURL: oneApiEndpoint,
        },
        modelName: 'Doubao-pro-32k',
        temperature: 0.7,
      }),
    };

    return chatModels;
  } catch (err) {
    logger.error(`加载OneAPI模型时出错: ${err}`);
    return {};
  }
};
