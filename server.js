require('dotenv').config()
const express = require('express')
const fs = require('fs')
const clc = require('cli-color')
const crypto = require('crypto')
const mariadb = require('mariadb')
const pool = mariadb.createPool({
  host: '192.168.0.79',
  user: 'ev-client',
  database: 'endlessvendetta',
  password: process.env.DB_PASSWORD,
  connectionLimit: 10
})

const app = express()
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

app.get('/users/', (req, res) => {
  pool.getConnection().then((conn) => {
    conn
      .query('SELECT * FROM Players')
      .then((rows) => {
        res.render('players.ejs', { players: rows })
        conn.end()
      })
      .catch((err) => {
        //handle error
        console.log(err)
        conn.end()
      })
      .catch((err) => {
        console.log(err)
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
        conn.end()
      })
      .catch((err) => {
        console.log(err)
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
        conn.end()
      })
      .catch((err) => {
        console.log(err)
      })
  })
})

app.post('/api/user/', express.json(), (req, res) => {
  if (!req.body.data.Username && !req.body.data.GUID) {
    res.sendStatus(400)
    return
  }
  pool.getConnection().then((conn) => {
    conn
      .query('INSERT INTO Players SET = ?', [req.body.data])
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
          console.log(`${logTimestamp} ${clc.red('Duplicate entry')}`)
          res.sendStatus(409)
        } else {
          console.log(err)
        }
        conn.end()
      })
      .catch((err) => {
        console.log(err)
      })
  })
})

app.post('/api/event/', express.json(), (req, res) => {
  if (!req.body.data.eventID && !req.body.data.SessionID && !req.body.data.PlayerGUID && !req.body.data.EventKey && !req.body.data.EventData && !req.body.data.Timestamp) {
    res.sendStatus(400)
    return
  }
  pool.getConnection().then((conn) => {
    conn
      .query('INSERT INTO FeedbackEvents SET = ?', [req.body.data])
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
          console.log(`${logTimestamp} ${clc.red('Duplicate entry')}`)
          res.sendStatus(409)
        } else {
          console.log(err)
        }
        conn.end()
      })
      .catch((err) => {
        console.log(err)
      })
  })
})

app.all('*', (req, res) => {
  res.sendStatus(404)
})

function LogConnections(req, res, next) {
  console.log(
    `${logTimestamp} ${clc.inverse(req.method)} request for ${clc.underline(req.url)} from ${clc.cyan(
      req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0] : req.socket.remoteAddress
    )}`
  )
  next()
}

app.listen(port, () => {
  console.log(`${clc.green(`${logTimestamp} Listening on port ${port}`)}`)
})

var date = new Date(),
  logTimestamp =
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

function makeID(length) {
  let result = ''
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const charactersLength = characters.length
  let counter = 0
  while (counter < length) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength))
    counter += 1
  }
  return result
}
