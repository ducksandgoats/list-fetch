module.exports = async function makeBTFetch (opts = {}) {
  const {makeFetch} = await import('make-fetch')
  const streamToIterator = require('stream-async-iterator')
  const mime = require('mime/lite')
  const parseRange = require('range-parser')
  const Torrentz = require('torrentz')
  const path = require('path')

  const DEFAULT_OPTS = {}
  const finalOpts = { ...DEFAULT_OPTS, ...opts }
  const checkHash = /^[a-fA-F0-9]{40}$/
  const checkAddress = /^[a-fA-F0-9]{64}$/
  const checkTitle = /^[a-zA-Z0-9]{16}$/
  const SUPPORTED_METHODS = ['GET', 'POST', 'DELETE', 'HEAD']
  const hostType = '_'

  const app = await new Promise((resolve) => {if(finalOpts.torrentz){resolve(finalOpts.torrentz)}else{resolve(new Torrentz(finalOpts))}})

  // const prog = new Map()

  function handleTorrent(torrent){
    let test = '<div>'
    for(const i in torrent){
      if(i === 'infohash'){
        test = test + `<p>${i}: ${torrent[i]}</p><p>link: <a href='bt://${torrent[i]}/'>${torrent[i]}</a></p>`
      }
      if(i === 'address'){
        test = test + `<p>${i}: ${torrent[i]}</p><p>link: <a href='bt://${torrent[i]}/'>${torrent[i]}</a></p>`
      }
      if(i === 'secret'){
        test = test + `<p>${i}: ${torrent[i]}</p>`
      }
      if(i === 'title'){
        test = test + `<p>${i}: ${torrent[i]}</p>`
      }
    }
    if(test === '<div>'){
      test = test + `<p>there is no new torrent</p></div>`
    } else {
      test = test + '</div>'
    }
    return test
  }

  function handleFile(id, saved, mid){
    let test = '<div>'
    saved.forEach((data) => {
      test = test + `<p>file: ${data}</p><p>link: <a href='bt://${id}${path.join(mid, data).replace(/\\/g, "/")}'></a></p>`
    })
    if(test === '<div>'){
      test = test + '<p>no files were uploaded</p></div>'
    } else {
      test = test + '</div>'
    }
    return test
  }

  function takeCareOfIt(data){
    console.log(data)
    throw new Error('aborted')
  }

  function sendTheData(theSignal, theData){
    if(theSignal){
      theSignal.removeEventListener('abort', takeCareOfIt)
    }
    return theData
  }

  function htmlIden(data){
    if(data.id.length === 64){
      data.kind = 'address'
      data.link = `<a href='bt://${data.address}/'>${data.address}</a>`
    } else if(data.id.length === 40){
      data.kind = 'infohash'
      data.link = `<a href='bt://${data.infohash}/'>${data.infohash}</a>`
    } else if(data.id.length === 20){
      data.kind = 'title'
      data.link = `<a href='bt://${data.infohash}/'>${data.infohash}</a>`
    }
    return `<p>${JSON.stringify(data)}</p>`
  }

  function jsonIden(data){
    if(data.id.length === 64){
      data.kind = 'address'
      data.link = `bt://${data.address}/`
    } else if(data.id.length === 40){
      data.kind = 'infohash'
      data.link = `bt://${data.infohash}/`
    } else if(data.id.length === 20){
      data.kind = 'title'
      data.link = `bt://${data.infohash}/`
    }
    return data
  }

  function htmlDir(data){
    if(data.name.length === 64){
      data.kind = 'address'
    } else if(data.name.length === 40){
      data.kind = 'infohash'
    } else if(data.name.length === 20){
      data.kind = 'title'
    } else {
      data.kind = 'other'
    }
    if(data.isDirectory()){
      data.type = 'directory'
    } else if(data.isFile()){
      data.type = 'file'
    } else {
      data.type = 'other'
    }
    return `<p>${JSON.stringify(data)}</p>`
  }

  function jsonDir(data){
    if(data.name.length === 64){
      data.kind = 'address'
    } else if(data.name.length === 40){
      data.kind = 'infohash'
    } else if(data.name.length === 20){
      data.kind = 'title'
    } else {
      data.kind = 'other'
    }
    if(data.isDirectory()){
      data.type = 'directory'
    } else if(data.isFile()){
      data.type = 'file'
      return {type: 'file', name: data.name, id: data.kind}
    } else {
      data.type = 'other'
    }
    return data
  }

  // function htmlAuthor(arr){
  //   return arr.map((data) => {
  //     for()
  //   })
  // }

  function getMimeType (path) {
    let mimeType = mime.getType(path) || 'text/plain'
    if (mimeType.startsWith('text/')) mimeType = `${mimeType}; charset=utf-8`
    return mimeType
  }

  function formatReq (hostname, pathname, extra) {

    // let mainType = hostname[0] === hostType || hostname[0] === sideType ? hostname[0] : ''
    const mainQuery = hostname === hostType ? true : false
    const mainHost = hostname
    const mainId = {}
    if(!mainQuery){
      if(checkAddress.test(mainHost)){
        mainId.address = mainHost
        mainId.secret = extra
      } else if(checkHash.test(mainHost)){
        mainId.infohash = mainHost
      } else if(checkTitle.test(mainHost)){
        mainId.title = mainHost
      } else {
        throw new Error('identifier is invalid')
      }
    }
    // if(pathname){
    //     console.log(decodeURIComponent(pathname))
    // }
    const mainPath = decodeURIComponent(pathname)
    const mainLink = `bt://${mainHost}${mainPath.includes('.') ? mainPath : mainPath + '/'}`
    return { mainQuery, mainHost, mainPath, mainId, mainLink }
  }

  const fetch = makeFetch(async (request) => {
    // if (request.body !== null) {
    //   request.body = await getBody(request.body)
    //   try {
    //     request.body = JSON.parse(request.body)
    //   } catch (error) {
    //     console.log(error)
    //   }
    // }

    const { url, method, headers: reqHeaders, body, signal } = request

    if(signal){
      signal.addEventListener('abort', takeCareOfIt)
    }

    try {
      const { hostname, pathname, protocol, search, searchParams } = new URL(url)

      if (protocol !== 'bt:') {
        return sendTheData(signal, {statusCode: 409, headers: {}, data: ['wrong protocol']})
      } else if (!method || !SUPPORTED_METHODS.includes(method)) {
        return sendTheData(signal, {statusCode: 409, headers: {}, data: ['something wrong with method']})
      } else if ((!hostname) || (hostname.length === 1 && hostname !== hostType)) {
        return sendTheData(signal, {statusCode: 409, headers: {}, data: ['something wrong with hostname']})
      }

      const mid = formatReq(decodeURIComponent(hostname), decodeURIComponent(pathname), reqHeaders['x-authentication'])

      const mainReq = !reqHeaders.accept || !reqHeaders.accept.includes('application/json')
      const mainRes = mainReq ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8'

      if(method === 'HEAD'){
        if (mid.mainQuery) {
          return sendTheData(signal, {statusCode: 400, headers: {'Content-Length': '0'}, data: []})
        } else {
          if(reqHeaders['x-echo']){
            if(JSON.parse(reqHeaders['x-echo'])){
              const torrentData = await app.echoTorrent(mid.mainId, {timeout: (reqHeaders['x-timer'] && reqHeaders['x-timer'] !== '0') || (searchParams.has('x-timer') && searchParams.get('x-timer') !== '0') ? Number(reqHeaders['x-timer'] || searchParams.get('x-timer')) : 0})
              const test = {}
              if(torrentData.address){
                test['X-Address'] = torrentData.address
                test['X-Link'] = `<bt://${torrentData.address}${mid.mainPath}>; rel="canonical"`
              }
              if(torrentData.secret){
                test['X-Secret'] = torrentData.secret
              }
              if(torrentData.title){
                test['X-Title'] = torrentData.title
              }
              if(torrentData.infohash){
                test['X-Infohash'] = torrentData.infohash
                test['X-Link'] = `<bt://${torrentData.infohash}${mid.mainPath}>; rel="canonical"`
              }
              if(torrentData.id){
                test['X-Id'] = torrentData.id
              }
              return sendTheData(signal, {statusCode: 200, headers: test, data: []})
            } else {
              const torrentData = await app.unEchoTorrent(mid.mainId, {timeout: (reqHeaders['x-timer'] && reqHeaders['x-timer'] !== '0') || (searchParams.has('x-timer') && searchParams.get('x-timer') !== '0') ? Number(reqHeaders['x-timer'] || searchParams.get('x-timer')) : 0})
              const test = {}
              if(torrentData.address){
                test['X-Address'] = torrentData.address
              }
              if(torrentData.infohash){
                test['X-Infohash'] = torrentData.infohash
              }
              if(torrentData.id){
                test['X-Id'] = torrentData.id
              }
              return sendTheData(signal, {statusCode: 200, headers: test, data: []})
            }
          } else {
            const torrentData = await app.loadTorrent(mid.mainId, mid.mainPath, {timeout: (reqHeaders['x-timer'] && reqHeaders['x-timer'] !== '0') || (searchParams.has('x-timer') && searchParams.get('x-timer') !== '0') ? Number(reqHeaders['x-timer'] || searchParams.get('x-timer')) : 0})
            if (torrentData) {
              if(torrentData.infoHash){
                const useHeaders = {}
                // useHeaders['Content-Type'] = mid.mainRes
                useHeaders['Content-Length'] = `${torrentData.length}`
                useHeaders['Accept-Ranges'] = 'bytes'
                useHeaders['X-Downloaded'] = `${torrentData.downloaded}`
  
                return sendTheData(signal, {statusCode: 200, headers: useHeaders, data: []})
              } else if(Array.isArray(torrentData)){
                let checkLength = 0
                torrentData.forEach((data) => {checkLength = checkLength + data.length})
  
                sendTheData(signal, {statusCode: 200, headers: {'Content-Length': String(checkLength)}, data: []})
              } else {
                const useHeaders = {}
                useHeaders['Content-Type'] = getMimeType(torrentData.path)
                useHeaders['Content-Length'] = `${torrentData.length}`
                useHeaders['Accept-Ranges'] = 'bytes'
                useHeaders['X-Downloaded'] = `${torrentData.downloaded}`
  
                return sendTheData(signal, {statusCode: 200, headers: useHeaders, data: []})
              }
            } else {
              return sendTheData(signal, {statusCode: 400, headers: {'Content-Length': '0'}, data: []})
            }
          }
        }
      } else if(method === 'GET'){
        if (mid.mainQuery) {
          if(reqHeaders['x-id'] || searchParams.has('x-id')){
            if(JSON.parse(reqHeaders['x-id'] || searchParams.get('x-id'))){
              const torrentData = await app.listDirectory(true)
              return sendTheData(signal, {statusCode: 200, headers: {'Content-Type': mainRes}, data: mainReq ? [`<html><head><title>${mid.mainLink}</title></head><body><div>${torrentData.map(htmlIden)}</div></body></html>`] : [JSON.stringify(torrentData.map(jsonIden))]})
            } else {
              const torrentData = await app.listDirectory(false)
              return sendTheData(signal, {statusCode: 200, headers: {'Content-Type': mainRes}, data: mainReq ? [`<html><head><title>${mid.mainLink}</title></head><body><div>${torrentData.map((data) => {return `<p><a href='bt://${data}/'>${data}</a></p>`})}</div></body></html>`] : [JSON.stringify(torrentData.map((data) => {return `bt://${data}/`}))]})
            }
          } else if(reqHeaders['x-dir'] || searchParams.has('x-dir')){
            if(JSON.parse(reqHeaders['x-dir'] || searchParams.get('x-dir'))){
              const torrentData = await app.getDirectory(true)
              return sendTheData(signal, {statusCode: 200, headers: {'Content-Type': mainRes}, data: mainReq ? [`<html><head><title>${mid.mainLink}</title></head><body><div>${torrentData.map(htmlDir)}</div></body></html>`] : [JSON.stringify(torrentData.map(jsonDir))]})
            } else {
              const torrentData = await app.getDirectory(false)
              return sendTheData(signal, {statusCode: 200, headers: {'Content-Type': mainRes}, data: mainReq ? [`<html><head><title>${mid.mainLink}</title></head><body><div>${torrentData.map((data) => {return `<p>${data}</p>`})}</div></body></html>`] : [JSON.stringify(torrentData)]})
            }
          } else if(reqHeaders['x-auth']){
            const torrentData = await app.getAuthor()
            if(JSON.parse(reqHeaders['x-auth'])){
              return sendTheData(signal, {statusCode: 200, headers: {'Content-Type': mainRes}, data: mainReq ? [`<html><head><title>${mid.mainLink}</title></head><body><div>${torrentData.map((data) => {return `<p><a href='bt://${data}/'>${data}</a></p>`})}</div></body></html>`] : [JSON.stringify(torrentData.map((data) => {return `bt://${data}/`}))]})
            } else {
              return sendTheData(signal, {statusCode: 200, headers: {'Content-Type': mainRes}, data: mainReq ? [`<html><head><title>${mid.mainLink}</title></head><body><div>${torrentData.map((data) => {return `<p>${data}</p>`})}</div></body></html>`] : [JSON.stringify(torrentData)]})
            }
          } else {
            const torrentData = await app.listAuthor()
            return sendTheData(signal, {statusCode: 200, headers: {'Content-Type': mainRes}, data: mainReq ? [`<html><head><title>${mid.mainLink}</title></head><body><div>${torrentData.map((data) => {if(data.address){data.link = `<a href='bt://${data.address}/'>${data.address}</a>`} else if(data.title){data.link = `<a href='bt://${data.infohash}/'>${data.infohash}</a>`} return `<p>${JSON.stringify(data)}</p>`;})}</div></body></html>`] : [JSON.stringify(torrentData.map((data) => {if(data.address){data.link = `bt://${data.address}/`} else if(data.title){data.link = `bt://${data.infohash}/`} return data;}))]})
          }
        } else {
          const mainRange = reqHeaders.Range || reqHeaders.range
          const torrentData = await app.loadTorrent(mid.mainId, mid.mainPath, {timeout: (reqHeaders['x-timer'] && reqHeaders['x-timer'] !== '0') || (searchParams.has('x-timer') && searchParams.get('x-timer') !== '0') ? Number(reqHeaders['x-timer'] || searchParams.get('x-timer')) : 0})
          if(torrentData){
            if(torrentData.infoHash){
              return sendTheData(signal, {statusCode: 200, headers: {'Content-Type': mainRes, 'Content-Length': String(torrentData.length)}, data: mainReq ? [`<html><head><title>${mid.mainLink}</title></head><body><div><h1>${torrentData.infohash}</h1>${torrentData.files.map(file => { return `<p><a href='${file.urlPath}'>${file.name}</a></p>` })}</div></body></html>`] : [JSON.stringify(torrentData.files.map(file => { return file.urlPath }))]})
            } else {
              if(Array.isArray(torrentData)){
                let checkLength = 0
                torrentData.forEach((data) => {checkLength = checkLength + data.length})
                return sendTheData(signal, {statusCode: 200, headers: {'Content-Type': mainRes, 'Content-Length': String(checkLength)}, data: mainReq ? [`<html><head><title>${mid.mainLink}</title></head><body><div><h1>Directory</h1><p><a href='../'>..</a></p>${torrentData.map(file => { return `<p><a href='${file.urlPath}'>${file.name}</a></p>` })}</div></body></html>`] : [JSON.stringify(torrentData.map(file => { return file.urlPath }))]})
              } else {
                if (mainRange) {
                  const ranges = parseRange(torrentData.length, mainRange)
                  if (ranges && ranges.length && ranges.type === 'bytes') {
                    const [{ start, end }] = ranges
                    const length = (end - start + 1)

                    return sendTheData(signal, {statusCode: 206, headers: {'Content-Length': `${length}`, 'Content-Range': `bytes ${start}-${end}/${torrentData.length}`, 'Content-Type': getMimeType(torrentData.path)}, data: streamToIterator(torrentData.createReadStream({ start, end }))})
                  } else {
                    return sendTheData(signal, {statusCode: 416, headers: {'Content-Type': getMimeType(torrentData.path), 'Content-Length': String(torrentData.length)}, data: ['range is not satisfiable']})
                  }
                } else {
                  return sendTheData(signal, {statusCode: 200, headers: {'Content-Type': getMimeType(torrentData.path), 'Content-Length': String(torrentData.length)}, data: streamToIterator(torrentData.createReadStream())})
                }
              }
            }
          } else {
            return sendTheData(signal, {statusCode: 400, headers: {'Content-Type': mainRes}, data: mainReq ? [`<html><head><title>${mid.mainLink}</title></head><body><div><p>could not find the data</p></div></body></html>`] : [JSON.stringify('could not find the data')]})
          }
        }
      } else if(method === 'POST'){
        if(!body){
          return sendTheData(signal, {statusCode: 400, headers: {'Content-Type': mainRes}, data: mainReq ? [`<html><head><title>${mid.mainLink}</title></head><body><div><p>must have a body</p></div></body></html>`] : [JSON.stringify('must have a body')]})
        } else {
          const useOpts = {
            count: reqHeaders['x-version'] || searchParams.has('x-version') ? Number(reqHeaders['x-version'] || searchParams.get('x-version')) : null,
            timeout: (reqHeaders['x-timer'] && reqHeaders['x-timer'] !== '0') || (searchParams.has('x-timer') && searchParams.get('x-timer') !== '0') ? Number(reqHeaders['x-timer'] || searchParams.get('x-timer')) : 0,
            opt: reqHeaders['x-opt'] || searchParams.has('x-opt') ? JSON.parse(reqHeaders['x-opt'] || decodeURIComponent(searchParams.get('x-opt'))) : null
          }
          if (mid.mainQuery) {
            if(JSON.parse(reqHeaders['x-update']) || JSON.parse(searchParams.has('x-update'))){
              const torrentData = await app.publishTorrent({address: null, secret: null}, mid.mainPath, reqHeaders['content-type'] && reqHeaders['content-type'].includes('multipart/form-data') ? reqHeaders : null, body, useOpts)
              return sendTheData(signal, {statusCode: 200, headers: {'Content-Length': String(torrentData.length), 'Content-Type': mainRes, 'X-Id': torrentData.id, 'X-Sequence': torrentData.sequence, 'X-Title': torrentData.title, 'X-Secret': torrentData.secret, 'X-Address': torrentData.address, 'X-Infohash': torrentData.infohash}, data: mainReq ? [`<html><head><title>${mid.mainLink}</title></head><body><div>${JSON.stringify(torrentData.saved.map((data) => {return {tid: torrentData.address, file: data, link: `bt://${torrentData.address}${path.join(mid.mainPath, data).replace(/\\/g, "/")}`}}))}</div></body></html>`] : [JSON.stringify(torrentData.saved.map((data) => {return {tid: torrentData.address, file: data, link: `bt://${torrentData.address}${path.join(mid.mainPath, data).replace(/\\/g, "/")}`}}))]})
            } else {
              const torrentData = await app.publishTorrent({infohash: null}, mid.mainPath, reqHeaders['content-type'] && reqHeaders['content-type'].includes('multipart/form-data') ? reqHeaders : null, body, useOpts)
              return sendTheData(signal, {statusCode: 200, headers: {'Content-Length': String(torrentData.length), 'Content-Type': mainRes, 'X-Infohash': torrentData.infohash, 'X-Id': torrentData.id}, data: mainReq ? [`<html><head><title>${mid.mainLink}</title></head><body><div>${JSON.stringify(torrentData.saved.map(data => {return {tid: torrentData.infohash, file: data, link: `bt://${torrentData.infohash}${path.join(mid.mainPath, data).replace(/\\/g, "/")}`}}))}</div></body></html>`] : [JSON.stringify(torrentData.saved.map(data => {return {tid: torrentData.infohash, file: data, link: `bt://${torrentData.infohash}${path.join(mid.mainPath, data).replace(/\\/g, "/")}`}}))]})
            }
          } else {
            if(reqHeaders['x-authentication'] || searchParams.has('x-authentication')){
              const torrentData = await app.publishTorrent(mid.mainId, mid.mainPath, reqHeaders['content-type'] && reqHeaders['content-type'].includes('multipart/form-data') ? reqHeaders : null, body, useOpts)
              return sendTheData(signal, {statusCode: 200, headers: {'Content-Length': String(torrentData.length), 'Content-Type': mainRes, 'X-Id': torrentData.id, 'X-Sequence': torrentData.sequence, 'X-Secret': torrentData.secret, 'X-Address': torrentData.address, 'X-Title': torrentData.title, 'X-Infohash': torrentData.infohash}, data: mainReq ? [`<html><head><title>${mid.mainLink}</title></head><body><div>${JSON.stringify(torrentData.saved.map(data => {return {tid: torrentData.address, file: data, link: `bt://${torrentData.address}${path.join(mid.mainPath, data).replace(/\\/g, "/")}`}}))}</div></body></html>`] : [JSON.stringify(torrentData.saved.map(data => {return {tid: torrentData.address, file: data, link: `bt://${torrentData.address}${path.join(mid.mainPath, data).replace(/\\/g, "/")}`}}))]})
            } else {
              const torrentData = await app.publishTorrent(mid.mainId, mid.mainPath, reqHeaders['content-type'] && reqHeaders['content-type'].includes('multipart/form-data') ? reqHeaders : null, body, useOpts)
              return sendTheData(signal, {statusCode: 200, headers: {'Content-Length': String(torrentData.length), 'Content-Type': mainRes, 'X-Infohash': torrentData.infohash, 'X-Id': torrentData.id}, data: mainReq ? [`<html><head><title>${mid.mainLink}</title></head><body><div>${JSON.stringify(torrentData.saved.map(data => {return {tid: torrentData.infohash, file: data, link: `bt://${torrentData.infohash}${path.join(mid.mainPath, data).replace(/\\/g, "/")}`}}))}</div></body></html>`] : [JSON.stringify(torrentData.saved.map(data => {return {tid: torrentData.infohash, file: data, link: `bt://${torrentData.infohash}${path.join(mid.mainPath, data).replace(/\\/g, "/")}`}}))]})
            }
          }
        }
      } else if(method === 'DELETE'){
        if (mid.mainQuery) {
          return sendTheData(signal, {statusCode: 400, headers: {'Content-Type': mainRes}, data: mainReq ? [`<html><head><title>${mid.mainLink}</title></head><body><div><p>must not use underscore</p></div></body></html>`] : [JSON.stringify('must not use underscore')]})
        } else {
          const torrentData = await app.shredTorrent(mid.mainId, mid.mainPath, {timeout: (reqHeaders['x-timer'] && reqHeaders['x-timer'] !== '0') || (searchParams.has('x-timer') && searchParams.get('x-timer') !== '0') ? Number(reqHeaders['x-timer'] || Number(searchParams.get('x-timer'))) : 0})
          const useHead = {}
          if(torrentData.torrent.address){
            useHead['X-Address'] = torrentData.torrent.address
          }
          if(torrentData.torrent.secret){
            useHead['X-Secret'] = torrentData.torrent.secret
          }
          if(torrentData.torrent.title){
            useHead['X-Title'] = torrentData.torrent.title
          }
          if(torrentData.torrent.infohash){
            useHead['X-Infohash'] = torrentData.torrent.infohash
          }
          const useData = useHead['X-Address'] || useHead['X-Infohash'] || torrentData.id
          return sendTheData(signal, {statusCode: 200, headers: {'Content-Type': mainRes, 'X-Id': torrentData.id, ...useHead}, data: mainReq ? [`<html><head><title>${mid.mainLink}</title></head><body><div>${JSON.stringify({tid: torrentData.id, path: torrentData.path, link: `bt://${useData}/`})}</div></body></html>`] : [JSON.stringify({tid: torrentData.id, path: torrentData.path, link: `bt://${useData}/`})]})
        }
      } else {
        return sendTheData(signal, {statusCode: 400, headers: { 'Content-Type': mainRes }, data: mainReq ? [`<html><head><title>${mid.mainLink}</title></head><body><div><p>method is not supported</p></div></body></html>`] : [JSON.stringify('method is not supported')]})
      }
    } catch (e) {
      const mainReq = !reqHeaders.accept || !reqHeaders.accept.includes('application/json')
      const mainRes = mainReq ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8'
      const useCode = e.name === 'ErrorTimeout' ? 408 : 500
      return sendTheData(signal, {statusCode: useCode, headers: {'Content-Type': mainRes}, data: mainReq ? [`<html><head><title>${e.name}</title></head><body><div><p>${e.stack}</p></div></body></html>`] : [JSON.stringify(e.stack)]})
    }
  })

  fetch.close = async () => {
    return await new Promise((resolve, reject) => {
      app.webtorrent.destroy(error => {
        if (error) {
          reject(error)
        } else {
          app.checkId.clear()
          clearInterval(app.updateRoutine)
          resolve()
        }
      })
    })
  }

  return fetch
}