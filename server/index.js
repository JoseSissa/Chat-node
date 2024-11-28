import express from 'express'
import logger from 'morgan'
import { createClient } from "@libsql/client";
import dotenv from 'dotenv'
dotenv.config()

import { Server } from 'socket.io'
import { createServer } from 'node:http'

const port = process.env.PORT || 3000

export const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

await turso.execute(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    username TEXT
  );`
)

const app = express()
const server = createServer(app)
const io = new Server(server)

// Socket.io
io.on('connection', async (socket) => {
  console.log('A user connected')

  socket.on('disconnect', () => {
    console.log('User disconnected')
  })

  socket.on('chat message', async (message) => {
    let result
    const username = socket.handshake.auth.username ?? 'Anonymous'
    try {
      result = await turso.execute({
        sql: `INSERT INTO messages (content, username) VALUES (?, ?)`,
        args: [message, username],
      })
    } catch (error) {
      console.error(error)
      return
    }

    io.emit('chat message', message, result.lastInsertRowid.toString(), username)
  })

  if(!socket.recovered) {
    try {
      const result = await turso.execute({
        sql: `SELECT id, content, username FROM messages WHERE id > ?`,
        args: [socket.handshake.auth.serverOffset ?? 0],
      })

      result.rows.forEach((row) => {
        socket.emit('chat message', row.content, row.id.toString(), row.username)
      })
    } catch (error) {
      console.error(error)
    }
  }
})
// Logger - Nos da trazabilidad sobre las peticiones que hacemos
app.use(logger('dev'))

app.get('/', (req, res) => {
  res.sendFile(process.cwd() + '/client/index.html')
})

server.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})