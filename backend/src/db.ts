import mongoose from 'mongoose'

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI

  if (!uri) {
    throw new Error(
      'MONGODB_URI environment variable is not set'
    )
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000
    })

    console.log('[db] connected to MongoDB')
  } catch (error) {
    console.error('[db] connection failed', error)
    throw error
  }

  mongoose.connection.on('error', (error) => {
    console.error('[db] connection error', error)
  })

  mongoose.connection.on('disconnected', () => {
    console.warn(
      '[db] disconnected — mongoose will attempt to reconnect'
    )
  })
}

export async function disconnectDB(): Promise<void> {
  await mongoose.connection.close()
}