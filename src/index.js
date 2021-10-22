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

const { program } = require('commander');
const { VieroHTTPServer } = require('@viero/common-nodejs/http/server');
const { VieroLog } = require('@viero/common/log');
const { VieroError } = require('@viero/common/error');
const path = require('path');

global.Promise = require('bluebird');

// eslint-disable-next-line import/no-dynamic-require
//const packageJson = require(path.join(__dirname, 'package.json'));

//program.version(packageJson.version);
program
  .option('-d, --debug', 'verbose logging')
  .option('-p, --port <port number>', 'TCP port to bind to', '12080')
  .option('-a, --address <address>', 'IP address or host to bind to', '::')
  .requiredOption('-c, --cache <path>', 'the cache directory')
  .requiredOption('-b, --baseURL <url>', 'the base URL');
program.parse(process.argv);

require('./cache').setCacheDirectory(path.resolve(program.cache));
require('./fetch').setBaseURL(program.baseURL);

if (program.debug) {
  VieroLog.level = VieroLog.LEVEL.DEBUG;
} else {
  VieroLog.level = VieroLog.LEVEL.INFO;
}

const log = new VieroLog('imageproxy');
const httpServer = new VieroHTTPServer();

httpServer.setCORSOptions({ origins: 'any', headers: ['content-type'] });

require('./endpoints')
  .register(httpServer)
  .then(() => httpServer.run({ host: program.address, port: program.port }))
  .catch((err) => {
    if (err instanceof VieroError && err.get && err.get(VieroError.KEY.ERROR)) {
      log.error(err.get(VieroError.KEY.ERROR).message);
    } else {
      log.error(err.message);
    }
    process.exit(err.code ? err.code : -1);
  });

/*
TODO:
- if-modified
- if-modified-since
- etag
- merge(intent, op)
*/
