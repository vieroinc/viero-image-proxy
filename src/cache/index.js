/**
 * Copyright 2020 Viero, Inc.
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

const { dirname, sep } = require('path');
const fs = require('fs');
const { PassThrough } = require('stream');

const { createReadStream } = fs;
const {
  open, mkdir, writeFile, unlink,
} = fs.promises;

const { VieroLog } = require('@viero/common/log');
const { VieroError } = require('@viero/common/error');
const { VieroThreads } = require('@viero/common-nodejs/threads');
const { http400 } = require('@viero/common-nodejs/http/server/error');

const log = new VieroLog('imageproxy/cache');
const b64Regex = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
let cacheDirectory = null;

const LENGTH_LENGTH = 4;
const DIGEST_LENGTH_OFFSET = 0;
const HEADERS_LENGTH_OFFSET = DIGEST_LENGTH_OFFSET + LENGTH_LENGTH;
const CONTENT_LENGTH_OFFSET = HEADERS_LENGTH_OFFSET + LENGTH_LENGTH;
const INDEX_LENGTH = CONTENT_LENGTH_OFFSET + LENGTH_LENGTH;

const digestPool = VieroThreads.createPool(`${__dirname}${sep}thread.hashing.js`, { max: 5 });

const genFilePathBy = (conversionOptions, cacheKey) => {
  if (!conversionOptions) {
    throw http400({
      userData: { [VieroError.KEY.ERROR]: new VieroError('imageproxy/cache', 892448) },
    });
  }
  if (!cacheKey) {
    throw http400({
      userData: { [VieroError.KEY.ERROR]: new VieroError('imageproxy/cache', 833668) },
    });
  }
  if (!b64Regex.test(cacheKey)) {
    throw http400({
      userData: { [VieroError.KEY.ERROR]: new VieroError('imageproxy/cache', 601781) },
    });
  }
  return [cacheDirectory, 'cache', ...cacheKey.replace(/\//g, '_').match(/.{1,2}/g), conversionOptions].join('/');
};

const from = (filePath) => open(filePath).then((fd) => {
  const indexBuffer = Buffer.alloc(INDEX_LENGTH);
  return fd.read(indexBuffer, 0, INDEX_LENGTH, 0).then(() => {
    const digestLength = indexBuffer.readUInt32LE(DIGEST_LENGTH_OFFSET);
    const keepHeadersLength = indexBuffer.readUInt32LE(HEADERS_LENGTH_OFFSET);
    const contentLength = indexBuffer.readUInt32LE(CONTENT_LENGTH_OFFSET);
    return Promise.all([
      fd.read(Buffer.alloc(digestLength), 0, digestLength, INDEX_LENGTH)
        .then(({ buffer }) => buffer),
      fd.read(Buffer.alloc(keepHeadersLength), 0, keepHeadersLength, INDEX_LENGTH + digestLength)
        .then(({ buffer }) => buffer),
    ]).then(([digestBuffer, keepHeadersBuffer]) => {
      const responseHeaders = {
        ...JSON.parse(keepHeadersBuffer),
        date: new Date().toUTCString(),
        etag: digestBuffer.toString(),
        'content-length': contentLength,
      };
      return [
        responseHeaders,
        // !! below fd is auto-close by default, nothing to do with fd now !!
        createReadStream(filePath, { fd, start: INDEX_LENGTH + digestLength + keepHeadersLength }),
      ];
    });
  });
});

const to = (filePath, headers, buffer) => digestPool.run(buffer).then((digest) => {
  const digestBuffer = Buffer.from(digest);
  const { connection: trash1, 'keep-alive': trash2, ...keepHeaders } = headers;
  const keepHeadersBuffer = Buffer.from(JSON.stringify(keepHeaders));
  const indexBuffer = Buffer.alloc(INDEX_LENGTH);
  indexBuffer.writeUInt32LE(digestBuffer.byteLength, DIGEST_LENGTH_OFFSET);
  indexBuffer.writeUInt32LE(keepHeadersBuffer.byteLength, HEADERS_LENGTH_OFFSET);
  indexBuffer.writeUInt32LE(buffer.byteLength, CONTENT_LENGTH_OFFSET);
  const concatenatedBuffer = Buffer.concat([indexBuffer, digestBuffer, keepHeadersBuffer, buffer]);
  const responseHeaders = {
    ...keepHeaders, date: new Date().toUTCString(), etag: digest, 'content-length': buffer.byteLength,
  };
  return mkdir(dirname(filePath), { recursive: true })
    .then(() => writeFile(filePath, concatenatedBuffer))
    .then(() => {
      const stream = new PassThrough();
      stream.end(buffer);
      // bufferStream.pipe(process.stdout);
      return [responseHeaders, stream];
    });
});

const purge = (path) => unlink(path);

module.exports = {
  from: (conversionOptions, cacheKey) => from(genFilePathBy(conversionOptions, cacheKey)),
  to: (headers, conversionOptions, cacheKey, buffer) => to(genFilePathBy(conversionOptions, cacheKey), headers, buffer),
  purge: (conversionOptions, cacheKey) => purge(genFilePathBy(conversionOptions, cacheKey)),
  setCacheDirectory(directory) {
    if (log.isDebug()) log.debug('setting cache directory', directory);
    cacheDirectory = directory;
  },
};
