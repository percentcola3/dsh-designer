// Generated from official @zvec/zvec-grep@0.2.1; Apache-2.0.
// Rebuild: node plugins/dsh-designer/build-zg-runtime.mjs --offline
// Provenance: zg-provenance.json; optional heavy providers explicitly disabled.
import {createRequire as __zgNativeCreateRequire} from "node:module";
const require = __zgNativeCreateRequire(import.meta.url);
const __zgZvecDirname = require("node:url").fileURLToPath(new URL("./zg-zvec-0.7.0/src/", import.meta.url));

// dist/engine/models/backends/model2vec-worker.js
import { parentPort, workerData } from "node:worker_threads";

// dist/engine/models/backends/model2vec-tokenizer.js
import { Tokenizer } from "@huggingface/tokenizers";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
async function loadModel2VecTokenizer(source) {
  const [tokenizerJson, tokenizerConfig] = await Promise.all([
    readJson(join(source, "tokenizer.json")),
    readJson(join(source, "tokenizer_config.json"))
  ]);
  const tokenizer2 = new Tokenizer(tokenizerJson, tokenizerConfig);
  const unknownTokenId = resolveUnknownTokenId(tokenizer2, tokenizerJson);
  const tokenize = (text, options) => {
    const ids = tokenizer2.encode(text, {
      add_special_tokens: options.add_special_tokens
    }).ids;
    return {
      input_ids: {
        data: ids.length > options.max_length ? ids.slice(0, options.max_length) : ids
      }
    };
  };
  return Object.assign(tokenize, { unk_token_id: unknownTokenId });
}
async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
function resolveUnknownTokenId(tokenizer2, tokenizerJson) {
  const configuredId = tokenizerJson.model?.unk_id;
  if (typeof configuredId === "number" && Number.isInteger(configuredId)) {
    return configuredId;
  }
  const configuredToken = tokenizerJson.model?.unk_token;
  if (typeof configuredToken !== "string") {
    return null;
  }
  const tokenId = tokenizer2.token_to_id(configuredToken);
  return typeof tokenId === "number" && Number.isInteger(tokenId) ? tokenId : null;
}

// dist/engine/models/backends/model2vec-runtime.js
async function embedModel2VecTexts(texts, tokenizer2, table2, maxInputTokens, normalize) {
  const tokenized = await tokenizeModel2VecTexts(texts, tokenizer2, maxInputTokens);
  return {
    vectors: embedModel2VecTokenLists(tokenized.tokenLists, table2, normalize),
    truncated: tokenized.truncated
  };
}
async function tokenizeModel2VecTexts(texts, tokenizer2, maxInputTokens) {
  const truncatedInputIndexes = [];
  const tokenLists = await Promise.all(texts.map(async (text, index) => {
    const encoded = await tokenizer2(text, {
      add_special_tokens: false,
      truncation: true,
      max_length: maxInputTokens + 1
    });
    const encodedTokenIds = Array.from(encoded.input_ids.data, Number);
    if (encodedTokenIds.length > maxInputTokens) {
      truncatedInputIndexes.push(index);
    }
    const unknownTokenId = tokenizer2.unk_token_id;
    return encodedTokenIds.slice(0, maxInputTokens).filter((id) => unknownTokenId === void 0 || unknownTokenId === null || id !== unknownTokenId);
  }));
  return {
    tokenLists,
    truncated: truncatedInputIndexes.sort((left, right) => left - right)
  };
}
function embedModel2VecTokenLists(tokenLists, table2, normalize) {
  return tokenLists.map((tokenIds) => embedStaticTokenList(tokenIds, table2, normalize));
}
function staticEmbeddingTableFromWorkerData(data2) {
  return {
    data: data2.dtype === "F16" ? new Uint16Array(data2.tableBuffer) : new Float32Array(data2.tableBuffer),
    dimension: data2.dimension,
    dtype: data2.dtype,
    rows: data2.rows
  };
}
function embedStaticTokenList(tokenIds, table2, normalize) {
  const dimension = table2.dimension;
  const halfValues = table2.dtype === "F16" ? halfFloatValues() : null;
  const vector = Array.from({ length: dimension }, () => 0);
  if (tokenIds.length === 0) {
    return vector;
  }
  for (let index = 0; index < tokenIds.length; index++) {
    const tokenId = tokenIds[index];
    if (!Number.isInteger(tokenId) || tokenId < 0 || tokenId >= table2.rows) {
      throw new Error(`Tokenizer returned out-of-range token id: id=${tokenId} rows=${table2.rows}`);
    }
    const start = tokenId * dimension;
    for (let column = 0; column < dimension; column++) {
      const value = table2.data[start + column];
      vector[column] += halfValues ? halfValues[value] : value;
    }
  }
  let squaredNorm = 0;
  for (let column = 0; column < dimension; column++) {
    vector[column] /= tokenIds.length;
    squaredNorm += vector[column] * vector[column];
  }
  if (normalize && squaredNorm > 0) {
    const inverseNorm = 1 / Math.sqrt(squaredNorm);
    for (let column = 0; column < dimension; column++) {
      vector[column] *= inverseNorm;
    }
  }
  return vector;
}
var cachedHalfFloatValues = null;
function halfFloatValues() {
  if (cachedHalfFloatValues) {
    return cachedHalfFloatValues;
  }
  const values = new Float32Array(65536);
  for (let bits = 0; bits < values.length; bits++) {
    const sign = bits & 32768 ? -1 : 1;
    const exponent = bits >> 10 & 31;
    const fraction = bits & 1023;
    if (exponent === 0) {
      values[bits] = sign * 2 ** -14 * (fraction / 1024);
    } else if (exponent === 31) {
      values[bits] = fraction === 0 ? sign * Infinity : Number.NaN;
    } else {
      values[bits] = sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
    }
  }
  cachedHalfFloatValues = values;
  return values;
}

// dist/engine/models/backends/model2vec-worker.js
var port = parentPort;
if (!port) {
  throw new Error("Model2Vec worker requires a parent port");
}
var data = workerData;
var tokenizer = await loadModel2VecTokenizer(data.tokenizerSource);
var table = staticEmbeddingTableFromWorkerData(data);
port.postMessage({ type: "ready" });
port.on("message", async (request) => {
  try {
    const result = await embedModel2VecTexts(request.texts, tokenizer, table, data.maxInputTokens, data.normalize);
    const flatVectors = new Float32Array(result.vectors.length * data.dimension);
    for (const [index, vector] of result.vectors.entries()) {
      flatVectors.set(vector, index * data.dimension);
    }
    const response = {
      type: "result",
      id: request.id,
      vectors: flatVectors.buffer,
      vectorCount: result.vectors.length,
      truncated: result.truncated
    };
    port.postMessage(response, [flatVectors.buffer]);
  } catch (error) {
    const cause = error instanceof Error ? error : new Error(String(error));
    port.postMessage({
      type: "error",
      id: request.id,
      error: {
        name: cause.name,
        message: cause.message,
        stack: cause.stack
      }
    });
  }
});
