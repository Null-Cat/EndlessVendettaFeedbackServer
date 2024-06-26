require('dotenv').config()
const express = require('express')
const app = express()
const server = require('http').createServer(app)
const io = require('socket.io')(server, { cors: { origin: '*' } })
const fs = require('fs')
const clc = require('cli-color')
const crypto = require('crypto')
const mariadb = require('mariadb')
const pool = mariadb.createPool({
  host: '192.168.0.100',
  user: 'ev-client',
  database: 'endlessvendetta',
  password: process.env.DB_PASSWORD,
  connectionLimit: 10
})

const port = process.env.PORT || 3001

app.set('view engine', 'ejs')
app.set('views', './views')
app.enable('trust proxy')
app.use(express.urlencoded({ extended: true }))

app.use(LogConnections)

app.use(express.static('public'))

app.get('/', (req, res) => {
  res.render('index.ejs')
})

app.get('/sessions', (req, res) => {
  let sessionsData
  pool.getConnection().then((conn) => {
    conn
      .query('SELECT SessionID, PlayerGUID, Timestamp FROM FeedbackEvents WHERE EventKey = "start"')
      .then((rows) => {
        if (rows.length > 0) {
          sessionsData = rows
        } else {
          res.sendStatus(404)
        }
      })
      .catch((err) => {
        //handle error
        console.log(err)
        res.sendStatus(500)
        conn.end()
        return
      })
    conn
      .query('SELECT SessionID FROM FeedbackEvents WHERE EventKey = "end"')
      .then((rows) => {
        const sessionsEnd = rows.map((row) => row.SessionID)
        res.render('sessions.ejs', { sessions: sessionsData, sessionsEnd })
        conn.end()
      })
      .catch((err) => {
        //handle error
        console.log(err)
        res.sendStatus(500)
        conn.end()
      })
      .catch((err) => {
        console.log(err)
        res.sendStatus(500)
      })
  })
})

app.get('/session/:session', (req, res) => {
  pool.getConnection().then((conn) => {
    conn
      .query('SELECT EventID, PlayerGUID, EventKey, EventData, Timestamp FROM FeedbackEvents WHERE SessionID = ?', [req.params.session])
      .then((rows) => {
        if (rows.length > 0) {
          res.render('session.ejs', { events: rows, session: req.params.session })
        } else {
          res.sendStatus(404)
        }
        conn.end()
      })
      .catch((err) => {
        //handle error
        console.log(err)
        res.sendStatus(500)
        conn.end()
      })
      .catch((err) => {
        console.log(err)
        res.sendStatus(500)
      })
  })
})

app.get('/api/users/', (req, res) => {
  pool.getConnection().then((conn) => {
    conn
      .query('SELECT * FROM Players')
      .then((rows) => {
        res.send(rows)
        conn.end()
      })
      .catch((err) => {
        //handle error
        console.log(err)
        res.sendStatus(500)
        conn.end()
      })
      .catch((err) => {
        console.log(err)
        res.sendStatus(500)
      })
  })
})

app.get('/api/user/:username', (req, res) => {
  pool.getConnection().then((conn) => {
    conn
      .query('SELECT * FROM Players WHERE Username = ?', [req.params.username])
      .then((rows) => {
        if (rows.length > 0) {
          res.send(rows)
        } else {
          res.sendStatus(404)
        }
        conn.end()
      })
      .catch((err) => {
        //handle error
        console.log(err)
        res.sendStatus(500)
        conn.end()
      })
      .catch((err) => {
        console.log(err)
        res.sendStatus(500)
      })
  })
})

app.get('/api/session/:session', (req, res) => {
  pool.getConnection().then((conn) => {
    conn
      .query('SELECT * FROM FeedbackEvents WHERE SessionID = ?', [req.params.session])
      .then((rows) => {
        if (rows.length > 0) {
          res.send(rows)
        } else {
          res.sendStatus(404)
        }
        conn.end()
      })
      .catch((err) => {
        //handle error
        console.log(err)
        res.sendStatus(500)
        conn.end()
      })
      .catch((err) => {
        console.log(err)
        res.sendStatus(500)
      })
  })
})

app.post('/api/user/', express.json(), (req, res) => {
  if (!req.body.Username && !req.body.GUID) {
    res.sendStatus(400)
    return
  }

  const columns = Object.keys(req.body).join(', ')
  const values = Object.values(req.body)
  pool.getConnection().then((conn) => {
    conn
      .query(`INSERT INTO Players (${columns}) VALUES (?)`, [values])
      .then((rows) => {
        if (rows.length > 0) {
          res.sendStatus(201)
        } else {
          res.sendStatus(404)
        }
        conn.end()
      })
      .catch((err) => {
        //handle error
        if (err && err.code === 'ER_DUP_ENTRY') {
          console.log(`${getLogTimestamp()} ${clc.red('Duplicate entry')}`)
          res.sendStatus(409)
        } else {
          console.log(err)
          res.sendStatus(500)
        }
        conn.end()
      })
      .catch((err) => {
        console.log(err)
        res.sendStatus(500)
      })
  })
})

app.post('/api/event/', express.json(), (req, res) => {
  if (!req.body.EventID && !req.body.SessionID && !req.body.PlayerGUID && !req.body.EventKey && !req.body.EventData && !req.body.Timestamp) {
    res.sendStatus(400)
    return
  }

  const columns = Object.keys(req.body).join(', ')
  const values = Object.values(req.body)
  pool.getConnection().then((conn) => {
    conn
      .query(`INSERT INTO FeedbackEvents (${columns}) VALUES (?)`, [values])
      .then((rows) => {
        res.sendStatus(201)
        console.log(`${getLogTimestamp()} ${clc.green(`'${req.body.EventKey}' Event Logged for ${req.body.SessionID}`)}`)
        io.to(req.body.SessionID).emit('eventTrigger', req.body)
        if (req.body.EventKey.toLowerCase() === 'end') {
          io.to('sessions').emit('sessionEnd', req.body.SessionID)
        }
        if (req.body.EventKey.toLowerCase() === 'start') {
          io.to('sessions').emit('sessionStart', req.body)
        }
        conn.end()
      })
      .catch((err) => {
        //handle error
        if (err && err.code === 'ER_DUP_ENTRY') {
          console.log(`${getLogTimestamp()} ${clc.red('Duplicate entry')}`)
          res.sendStatus(409)
        } else {
          console.log(err)
          res.sendStatus(500)
        }
        conn.end()
      })
      .catch((err) => {
        console.log(err)
        res.sendStatus(500)
      })
  })
})

app.delete('/api/session/:session', (req, res) => {
  pool.getConnection().then((conn) => {
    conn
      .query('DELETE FROM FeedbackEvents WHERE SessionID = ?', [req.params.session])
      .then((rows) => {
        if (rows) {
          res.sendStatus(200)
          console.log(`${getLogTimestamp()} ${clc.red(`Session ${req.params.session} Deleted`)}`)
        } else {
          res.sendStatus(404)
        }
        conn.end()
      })
      .catch((err) => {
        //handle error
        console.log(err)
        res.sendStatus(500)
        conn.end()
      })
      .catch((err) => {
        res.sendStatus(500)
        console.log(err)
      })
  })
})

app.all('*', (req, res) => {
  res.sendStatus(404)
})

function LogConnections(req, res, next) {
  console.log(
    `${getLogTimestamp()} ${clc.inverse(req.method)} request for ${clc.underline(req.url)} from ${clc.cyan(
      req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0] : req.socket.remoteAddress
    )}`
  )
  next()
}

server.listen(port, () => {
  console.log(`${clc.green(`${getLogTimestamp()} Listening on port ${port}`)}`)
})

io.on('connection', (socket) => {
  console.log(`${getLogTimestamp()} New Socket Connection ${clc.green(`${socket.id}`)}`)
  const referer = new URL(socket.request.headers.referer)
  const regex = /^\/session\/[A-Z0-9]{5}$/
  if (regex.test(referer.pathname)) {
    socket.join(referer.pathname.slice(-5))
    console.log(`${getLogTimestamp()} Socket ${clc.green(`${socket.id}`)} Joined ${clc.green(`${referer.pathname.slice(-5)}`)}`)
  }
  if (referer.pathname === '/sessions' || referer.pathname === '/sessions/') {
    socket.join('sessions')
    console.log(`${getLogTimestamp()} Socket ${clc.green(`${socket.id}`)} Joined ${clc.green(`sessions`)}`)
  }
  socket.on('disconnect', () => {
    console.log(`${getLogTimestamp()} ${clc.red(`Socket Disconnected ${socket.id}`)}`)
  })
})

function getLogTimestamp() {
  let date = new Date()
  let timeStamp =
    ('00' + (date.getMonth() + 1)).slice(-2) +
    '/' +
    ('00' + date.getDate()).slice(-2) +
    '/' +
    date.getFullYear() +
    ':' +
    ('00' + date.getHours()).slice(-2) +
    ':' +
    ('00' + date.getMinutes()).slice(-2) +
    ':' +
    ('00' + date.getSeconds()).slice(-2)
  return timeStamp
}

function makeID(length) {
  let result = ''
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length))
  }
  return result
}
