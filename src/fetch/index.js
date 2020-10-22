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
const { VieroHTTPClient } = require('@viero/common-nodejs/http/client');
const { errorCode } = require('@viero/common-nodejs/http/server/error');

const log = new VieroLog('imageproxy/fetch');
let baseURL = null;

module.exports = {
  setBaseURL: (url) => {
    // eslint-disable-next-line no-param-reassign
    if (url.endsWith('/')) url = url.slice(0, -1);
    if (log.isDebug()) log.debug('setting base URL', url);
    baseURL = url;
  },
  fetch: (path) => {
    const url = `${baseURL}/${path}`;
    return VieroHTTPClient.request(url)
      .then((res) => {
        if (res.statusCode === 200) return Promise.all([url, res, res.data()]);
        throw errorCode({ code: res.statusCode, message: res.statusMessage, userData: { url } });
      });
  },
};
