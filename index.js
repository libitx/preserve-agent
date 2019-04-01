const { promisify } = require('util')
const fs            = require('fs')
const path          = require('path')
const Koa           = require('koa')
const logger        = require('koa-logger')
const fb            = require('@functional-bitcoin/agent')
const redisCache    = require('@functional-bitcoin/agent/lib/cache/redis')

// Load middlewards
const dnsMiddleware     = require('./lib/dns-middleware')
const routerMiddleware  = require('./lib/router-middleware')
const fileMiddleware    = require('./lib/file-middleware')

// Configure Functional Bitcoin
const bitdbKey      = process.env.BITDB_KEY || '14UgWjqscycW3Hz3XDEzpAdf4nYRogBANL';
fb.config.adapter.key = bitdbKey;
fb.config.cache = redisCache;
fb.config.cache.connect()
fb.config.cache.hgetallAsync = promisify(fb.config.cache.client.hgetall).bind(fb.config.cache.client)

// Create assets directory at startup
const dataDir = path.join(__dirname, (process.env.DATA_DIR || 'data'))
fs.access(dataDir, fs.constants.F_OK | fs.constants.W_OK, err => {
  if (err) {
    fs.mkdir(dataDir, err => {
      if (err) throw new Error('Failed to create assets directory');
      console.log('Assets directory created')
    })
  } else {
    console.log('Assets directory exists')
  }
})

// Initate app and fb agent
const app       = new Koa()
const agent     = new fb.Agent({
  transforms: {
    '19HxigV4QyBv3tHpQVcUEQyq1pzZVdoAut': '5f94a325c835ac0fcc89370061c6a63b305b2c6cf3d2fe002d264e98dbd44ac2'
  }
})

app.context.dataDir = dataDir;
app.context.agent = agent;

const port = process.env.PORT || 3000;

app
  .use(logger())
  .use(dnsMiddleware)
  .use(routerMiddleware)
  .use(fileMiddleware)
  .listen(port, _ => {
    console.log(`Preserve Agent listening on port ${ port }`)
  })
