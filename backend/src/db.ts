import mongoose from 'mongoose'

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI

  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not set')
  }

  try {
    await mongoose.connect(uri)
    console.log('[db] connected to MongoDB')
  } catch (err) {
    console.error('[db] connection failed', err)
    throw err
  }

  mongoose.connection.on('error', (err) => {
    console.error('[db] connection error', err)
  })

  mongoose.connection.on('disconnected', () => {
    console.warn('[db] disconnected — mongoose will attempt to reconnect')
  })
}

export async function disconnectDB(): Promise<void> {
  await mongoose.connection.close()
}
