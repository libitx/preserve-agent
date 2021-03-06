const fs    = require('fs')
const path  = require('path')
const axios = require('axios')
const fb    = require('@functional-bitcoin/agent')

const cacheExpire = 2628000;

const getLocalFile = (fullPath, meta) => {
  const data = fs.createReadStream(fullPath);
  return {
    meta,
    data,
    cached: true
  }
}

const getRemoteFile = sha256 => {
  const url = `https://data.bitdb.network/1KuUr2pSJDao97XM8Jsq8zwLS6W1WtFfLg/c/${ sha256 }`;
  return axios.get(url, { responseType: 'stream' })
    .then(r => {
      return {
        meta: {
          type: r.headers['content-type'],
          size: r.headers['content-length']
        },
        data: r.data
      }
    })
}

const cacheFile = (fullPath, file) => {
  console.log('caching file')
  return new Promise(resolve => {
    const stream = fs.createWriteStream(fullPath, { encoding: file.encoding })
    file.data.pipe(stream)
    stream.on('finish', resolve)
  })
}

const cacheMeta = (key, meta) => {
  console.log('caching file meta')
  const multi = fb.config.cache.client.multi();
  Object.keys(meta)
    .forEach(k => multi.hmset(key, k, meta[k]))
  multi.expire(key, cacheExpire)
  multi.exec()
}

module.exports = (ctx, next) => {
  let cacheKey, route;
  return new Promise((resolve, reject) => {
    ctx.agent.runScript(ctx.state.router)
      .on('success', script => resolve(script.result))
      .on('error', err => reject(err))
    })
    .then(router => {
      route     = router.match(ctx.path);
      cacheKey  = `preserve:c:${ route.c }`;
      return fb.config.cache.hgetallAsync(cacheKey)
    })
    .then(meta => {
      if (meta) {
        return getLocalFile(path.join(ctx.dataDir, route.c), meta);
      } else {
        return getRemoteFile(route.c)
      }
    })
    .then(file => {
      ctx.set('Bitcoin-Address', ctx.state.address)
      ctx.set('Bitcoin-TX', route.b)
      ctx.set('ETag', route.c)
      ctx.set('Content-Length', file.meta.size)
      ctx.type  = file.meta.type;
      ctx.body  = file.data;

      return next().then(async _ => {
        if (!file.cached) {
          await cacheFile(path.join(ctx.dataDir, route.c), file)
          cacheMeta(cacheKey, file.meta)
        }
      })
    })
    .catch(err => {
      console.error(err)
      ctx.status = 404;
    })
}