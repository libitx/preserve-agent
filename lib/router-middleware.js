const axios = require('axios')
const fb    = require('@functional-bitcoin/agent')

const cacheExpire = 604800,
      cacheTTL    = 600;

const getRouter = address => {
  const query = {
    "v": 3,
    "q": {
      "find": {
        "in.e.a": address,
        "out.s5": '@router'
      },
      "project": { "tx.h": true },
      "sort": { "blk.t": -1 },
      "limit": 1
    },
    "r": {
      "f": "[.[] | { txid: .tx.h }]"
    }
  }

  const path  = Buffer.from(JSON.stringify(query)).toString('base64'),
        url   = fb.config.adapter.babel.q + path,
        headers = { key: fb.config.adapter.key };

  return axios.get(url, { headers })
    .then(r => r.data.u.concat(r.data.c)[0])
    .then(tx => tx ? { txid: tx.txid } : {})
}

const cacheRouter = (key, txid, updated) => {
    console.log('caching router txid')
    const multi = fb.config.cache.client.multi();
    multi.hmset(key, 'txid', txid)
    multi.hmset(key, 'updated', updated)
    multi.expire(key, cacheExpire)
    multi.exec()
  }

module.exports = (ctx, next) => {
  // Try loading TXID from cache
  const cacheKey = `preserve:${ ctx.hostname }:router`
  return fb.config.cache.hgetallAsync(cacheKey)
    // If needed load router TXID from bitdb
    .then(res => {
      if (res) return res;
      return getRouter(ctx.state.address)
    })
    // Save router TXID to state
    .then(({ txid, updated }) => {
      if (!txid) throw new Error('Router TX not found')
      ctx.state.router = txid;

      return next().then(_ => {
        const now = Math.floor(Date.now() / 1000)
        if (!updated) {
          cacheRouter(cacheKey, txid, now);
        } else if (now - updated > cacheTTL) {
          getRouter(ctx.state.address).then(({ txid }) => cacheRouter(cacheKey, txid, now))
        }
      })
    })
    .catch(err => {
      console.error(err)
      ctx.status = 404;
    })
}