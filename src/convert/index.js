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

const sharp = require('sharp');

const COPTIONS = [
  [/^\d+$/, (options, value) => {
    const n = Number.parseInt(value, 10);
    // eslint-disable-next-line no-param-reassign
    if (!options.resize) options.resize = {};
    // eslint-disable-next-line no-param-reassign
    options.resize = [{
      ...options.resize, width: n, height: n, fit: sharp.fit.inside,
    }];
  }],
  [/^\d+x\d+$/, (options, value) => {
    const split = value.split('x');
    const width = Number.parseInt(split[0], 10);
    const height = Number.parseInt(split[1], 10);
    // eslint-disable-next-line no-param-reassign
    if (!options.resize) options.resize = {};
    // eslint-disable-next-line no-param-reassign
    options.resize = [{
      ...options.resize, width, height, fit: sharp.fit.inside,
    }];
  }],
  [/^\d+x$/, (options, value) => {
    const width = Number.parseInt(value.split('x')[0], 10);
    // eslint-disable-next-line no-param-reassign
    if (!options.resize) options.resize = {};
    // eslint-disable-next-line no-param-reassign
    options.resize = [{ ...options.resize, width }];
  }],
  [/^x\d+$/, (options, value) => {
    const height = Number.parseInt(value.split('x')[1], 10);
    // eslint-disable-next-line no-param-reassign
    if (!options.resize) options.resize = {};
    // eslint-disable-next-line no-param-reassign
    options.resize = [{ ...options.resize, height }];
  }],
  [/^q\d{1,3}$/, (options, value, meta) => {
    const quality = Number.parseInt(value.split('q')[1], 10);
    // eslint-disable-next-line no-param-reassign
    if (!options.toFormat) options.toFormat = {};
    // eslint-disable-next-line no-param-reassign
    options.toFormat = [meta.format, { ...options.toFormat, quality }];
  }],
];

module.exports = {
  convert: (conversionOptions, source) => {
    const image = sharp(source);
    return image.metadata()
      .then((meta) => {
        const options = {};
        conversionOptions
          .split(',')
          .forEach((it) => COPTIONS
            .some((coption) => ((coption[0].test(it)) ? !!coption[1](options, it, meta) || true : false)));
        return Promise.each(Object.keys(options), (op) => image[op](...options[op])).then(() => image.toBuffer());
      });
  },
};
