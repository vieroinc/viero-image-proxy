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

const { VieroLog } = require('@viero/common/log');
const { respondOk, respondError } = require('@viero/common-nodejs/http/server/respond');
const { VieroHttpError, http404 } = require('@viero/common-nodejs/http/server/error');
const { VieroError } = require('@viero/common/error');
const { from, to, purge } = require('../cache');
const { fetch } = require('../fetch');
const { convert } = require('../convert');

const log = new VieroLog('imageproxy/endpoints');

const fetchConvertWrite = (path, conversionOptions, cacheKey) => fetch(path)
  .then(([fUrl, fRes, fetched]) => Promise.all([fUrl, fRes.headers, convert(conversionOptions, fetched)]))
  .then(([fUrl, headers, converted]) => to(headers, conversionOptions, cacheKey, converted)
    .then(([tHeaders, stream]) => ([fUrl, tHeaders, stream])));

const getOrAdd = ({
  conversionOptions, cacheKey, path,
}) => from(conversionOptions, cacheKey)
  .then(([headers, stream]) => ([headers, stream, '>', 'cache']))
  .catch((err) => {
    if (err.code !== 'ENOENT') throw err; // TODO: VieroError/FS
    return fetchConvertWrite(path, conversionOptions, cacheKey)
      .then(([fUrl, headers, stream]) => ([headers, stream, '>', fUrl]));
  });

const update = ({
  conversionOptions, cacheKey, path,
}) => fetchConvertWrite(path, conversionOptions, cacheKey)
  .then(([fUrl, headers, stream]) => ([headers, stream, '>>', fUrl]));

const remove = ({
  conversionOptions, cacheKey,
}) => purge(conversionOptions, cacheKey);

const respondWithStream = (headers, stream, url, sign, source, t, res) => {
  res.statusCode = 200;
  Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
  stream.on('end', () => {
    if (log.isDebug()) log.debug(200, `${Date.now() - t}ms`, url, sign, source);
  });
  stream.pipe(res);
};

const respondWithError = (err, url, t, res) => {
  if (err instanceof VieroHttpError) {
    res.statusCode = err.httpCode;
    res.statusMessage = err.httpMessage;
    if (log.isWarning()) {
      log.warning(
        res.statusCode, `${Date.now() - t}ms`, url, '!',
        err.get('url') || (err.get(VieroError.KEY.ERROR) ? err.get(VieroError.KEY.ERROR).message : 'unknown'),
      );
    }
  } else {
    res.statusCode = 500;
    res.statusMessage = 'Internal server error';
    if (log.isError()) {
      log.error(res.statusCode, `${Date.now() - t}ms`, url, '!', err.message);
    }
  }
  res.end();
};

module.exports = {
  register(server) {
    const route = server.route('/:conversionOptions/:cacheKey/:path...');
    route.get(({ req: { pathParams: { conversionOptions, cacheKey, path }, url }, res, t = Date.now() }) => Promise
      .try(() => getOrAdd({ conversionOptions, cacheKey, path }))
      .then(([headers, stream, sign, source]) => respondWithStream(headers, stream, url, sign, source, t, res))
      .catch((err) => respondWithError(err, url, t, res)));

    route.put(({ req: { pathParams: { conversionOptions, cacheKey, path }, url }, res, t = Date.now() }) => Promise
      .try(() => update({ conversionOptions, cacheKey, path }))
      .then(([headers, stream, sign, source]) => respondWithStream(headers, stream, url, sign, source, t, res))
      .catch((err) => respondWithError(err, url, t, res)));

    server.delete(
      '/:conversionOptions/:cacheKey',
      ({ req: { pathParams: { conversionOptions, cacheKey } }, res }) => Promise
        .try(() => remove({ conversionOptions, cacheKey }))
        .then(() => respondOk(res))
        .catch((err) => {
          if (err.code === 'ENOENT') return respondError(res, http404());
          return respondError(res, err);
        }),
    );
    return Promise.resolve();
  },
};
