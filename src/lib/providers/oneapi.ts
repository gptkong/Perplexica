import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { getOneApiKey, getOneApiEndpoint } from '../../config';
import logger from '../../utils/logger';

async function fetchOneAPIModels() {
  const oneApiKey = getOneApiKey();
  const oneApiEndpoint = getOneApiEndpoint();

  if (!oneApiKey || !oneApiEndpoint) return null;

  const response = await fetch(`${oneApiEndpoint}/models`, {
    headers: {
      Authorization: `Bearer ${oneApiKey}`,
    },
  });
  if (!response.ok) {
    throw new Error(`获取模型列表失败: ${response.statusText}`);
  }
  return await response.json();
}

function createModelInstance(ModelClass, modelId) {
  return new ModelClass({
    openAIApiKey: getOneApiKey(),
    configuration: {
      baseURL: getOneApiEndpoint(),
    },
    modelName: modelId,
    ...(ModelClass === ChatOpenAI ? { temperature: 0.7 } : {}),
  });
}

async function loadOneAPIModels(ModelClass, filterFunction) {
  try {
    const modelsData = await fetchOneAPIModels();
    if (!modelsData) return {};

    const models = {};
    for (const model of modelsData.data) {
      if (filterFunction(model.id)) {
        models[model.id] = createModelInstance(ModelClass, model.id);
      }
    }

    return models;
  } catch (err) {
    logger.error(`加载OneAPI模型时出错: ${err}`);
    return {};
  }
}

export const loadOneAPIChatModels = () => 
  loadOneAPIModels(
    ChatOpenAI, 
    (modelId: string) => !['embedding', 'embed', 'encoder'].some(keyword => modelId.toLowerCase().includes(keyword))
  );

export const loadOneAPIEmbeddingsModels = () => 
  loadOneAPIModels(
    OpenAIEmbeddings, 
    (modelId: string) => ['embedding', 'embed', 'encoder'].some(keyword => modelId.toLowerCase().includes(keyword))
  );
