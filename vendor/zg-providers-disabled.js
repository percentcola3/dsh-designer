// DeepSeek Harness thin distribution policy; not an embedding implementation.
// Official Model2Vec/Potion code remains in zg-core.js and its official worker.
export function unsupportedEmbeddingBackend(backend){
  const error=new Error(`The ${backend} embedding backend is not included in this lightweight zg runtime. Use the supported local static Potion model.`);
  error.name='UnsupportedEmbeddingBackendError';
  error.code='ZG_EMBEDDING_BACKEND_NOT_INCLUDED';
  error.backend=backend;
  throw error;
}
export class TransformersJsEmbeddingModel {constructor(){unsupportedEmbeddingBackend('transformers-js');}}
export class LlamaCppEmbeddingModel {constructor(){unsupportedEmbeddingBackend('llama-cpp');}}
