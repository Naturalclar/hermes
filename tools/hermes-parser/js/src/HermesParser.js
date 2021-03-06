/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 */

'use strict';

const HermesParserWASM = require('./HermesParserWASM');

const hermesParse = HermesParserWASM.cwrap('hermesParse', 'number', [
  'number',
  'number',
  'number',
  'number',
]);

const hermesParseResult_free = HermesParserWASM.cwrap(
  'hermesParseResult_free',
  'void',
  ['number'],
);

const hermesParseResult_getError = HermesParserWASM.cwrap(
  'hermesParseResult_getError',
  'string',
  ['number'],
);

const hermesParseResult_getASTReference = HermesParserWASM.cwrap(
  'hermesParseResult_getASTReference',
  'number',
  ['number'],
);

// Copy a string into the WASM heap and null-terminate
function copyToHeap(buffer, addr) {
  HermesParserWASM.HEAP8.set(buffer, addr);
  HermesParserWASM.HEAP8[addr + buffer.length] = 0;
}

function parse(source, sourceFilename) {
  // Allocate space on heap for source text
  const sourceBuffer = Buffer.from(source, 'utf8');
  const sourceAddr = HermesParserWASM._malloc(sourceBuffer.length + 1);

  // Allocate space on heap for source filename if one was provided
  let filenameBuffer = null;
  let filenameAddr = 0;
  let filenameSize = 0;
  const hasFilename = sourceFilename != null;
  if (hasFilename) {
    filenameBuffer = Buffer.from(sourceFilename, 'utf8');
    filenameSize = filenameBuffer.length;
    filenameAddr = HermesParserWASM._malloc(filenameBuffer.length + 1);
  }

  // Throw error and free memory if either allocation failed
  if (!sourceAddr || (hasFilename && !filenameAddr)) {
    if (sourceAddr) {
      HermesParserWASM._free(sourceAddr);
    } else if (filenameAddr) {
      HermesParserWASM._free(filenameAddr);
    }

    throw new Error('Parser out of memory');
  }

  try {
    // Copy source text and filename onto WASM heap
    copyToHeap(sourceBuffer, sourceAddr);
    if (hasFilename) {
      copyToHeap(filenameBuffer, filenameAddr);
    }

    const parseResult = hermesParse(
      sourceAddr,
      sourceBuffer.length + 1,
      filenameAddr,
      filenameSize + 1,
    );

    try {
      // Extract and throw error from parse result if parsing failed
      const err = hermesParseResult_getError(parseResult);
      if (err) {
        throw new Error(err);
      }

      // Find root AST mode from reference
      const astReference = hermesParseResult_getASTReference(parseResult);
      return HermesParserWASM.JSReferences.pop(astReference);
    } finally {
      hermesParseResult_free(parseResult);
    }
  } finally {
    HermesParserWASM._free(sourceAddr);
    HermesParserWASM._free(filenameAddr);
  }
}

module.exports = {
  parse,
};
