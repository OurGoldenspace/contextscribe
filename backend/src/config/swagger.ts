import swaggerJsdoc from 'swagger-jsdoc'

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ContextScribe API',
      version: '1.0.0',
      description: 'Clinical pre-visit intake API'
    },
    servers: [
      {
        url: 'http://localhost:4000',
        description: 'Development'
      },
      {
        url: 'https://contextscribe-production.up.railway.app',
        description: 'Production'
      }
    ]
  },
  apis: ['./src/routes/*.ts']
}

export const swaggerSpec = swaggerJsdoc(options)