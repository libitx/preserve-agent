const dns       = require('dns')
const fb        = require('@functional-bitcoin/agent')
const Message   = require('bsv/message')
const resolver  = new dns.promises.Resolver()

const cacheExpire = 86400,
      cacheTTL    = 3600;

const getDns = (hostname) => {
  const idHost = 'id._bsv.'+hostname;
  return resolver.resolveTxt(idHost)
    .then(records => {
      const record = records.flat().find(r => /(a|s)=/gi.test(r))
      return { record };
    })
}

const cacheDns = (key, record, updated) => {
  console.log('caching DNS')
  const multi = fb.config.cache.client.multi();
  multi.hmset(key, 'record', record)
  multi.hmset(key, 'updated', updated)
  multi.expire(key, cacheExpire)
  multi.exec()
}

module.exports = (ctx, next) => {
  // Try loading Address from cache
  const cacheKey = `preserve:${ ctx.hostname }:dns`;
  return fb.config.cache.hgetallAsync(cacheKey)
    // If needed, load TXT from DNS servers
    .then(res => {
      if (res) return res;
      return getDns(ctx.hostname)
    })
    // Verify DNS TXT record
    .then(({ record, updated }) => {
      if (!record) throw new Error('Host TXT record not found');

      const address   = record.match(/a=([^;\s]+)/i)[1],
            signature = record.match(/s=([^;\s]+)/i)[1];
      if ( !Message.verify(ctx.hostname, address, signature) ) {
        throw new Error('Host TXT record failed verification');
      }

      ctx.state.address = address;

      return next().then(_ => {
        const now = Math.floor(Date.now() / 1000)
        if (!updated) {
          cacheDns(cacheKey, record, now);
        } else if (now - updated > cacheTTL) {
          getDns(ctx.hostname).then(({ record }) => cacheDns(cacheKey, record, now))
        }
      })
    })
    .catch(err => {
      console.error(err)
      ctx.status = 404;
    })
}