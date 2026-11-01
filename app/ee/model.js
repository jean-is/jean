// SPDX-FileCopyrightText: 2026 Warehouse SAS
// SPDX-License-Identifier: Elastic-2.0

// The model that finds people's names (D681), pinned to a commit and each file to its hash: what `npm run masks` measured.
export const MODEL = Object.freeze({
  model: 'hackshare/curtain-privacy',
  revision: '324c09423e579ef1493b014e5a80168341879277',
  files: {
    'onnx/model_q4.onnx': 'c9bfe8a0a9e3cfbb1a8995009259a5195109c8881f16905ef5be58351ad8786f',
    'config.json': '6ee395e28fc152522357a6cd1493f9c78d69b76f90ce5bcaa43c6b7eca6c5bf3',
    'tokenizer.json': '382fa81cd4f2f6bec3d0755a335ffc7f2a40f7be2f469f9489d4bc8ddd617e00',
    'tokenizer_config.json': '994f46754c5bf4014f1aa92d34b1374319c3a6b3f702105cd5b742beaecd18ce',
    'special_tokens_map.json': '78cfc3cffa6689fdbf8e7c4e1267669d492ae1782882105a742f405d2d72aaed',
  },
})
// What a reading was made by: what's kept of one under another isn't used.
export const READER = 2
