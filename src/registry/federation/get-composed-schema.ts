import { composeAndValidateSchema } from '../../core/federation'
import { SchemaService } from '../../core/services/Schema'
import { FastifyInstance, FastifySchema } from 'fastify'
import { InvalidGraphNameError, SchemaCompositionError, SchemaVersionLookupError } from '../../core/errrors'

export const schema: FastifySchema = {
  response: {
    '2xx': {
      type: 'object',
      required: ['success', 'data'],
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'array',
          items: {
            type: 'object',
            required: ['version', 'typeDefs', 'serviceName', 'schemaId'],
            properties: {
              version: { type: 'string', minLength: 1, maxLength: 100 },
              typeDefs: { type: 'string', minLength: 1, maxLength: 10000 },
              serviceName: {
                type: 'string',
                minLength: 1,
                pattern: '[a-zA-Z_\\-0-9]+',
              },
              schemaId: { type: 'number', minimum: 1 },
            },
          },
        },
      },
    },
  },
  querystring: {
    type: 'object',
    required: ['graph_name'],
    properties: {
      graph_name: { type: 'string', minLength: 1, pattern: '[a-zA-Z_\\-0-9]+' },
    },
  },
}

export default function getComposedSchema(fastify: FastifyInstance) {
  fastify.get<{ Querystring: { graph_name: string } }>('/schema/latest', { schema }, async (req, res) => {
    const graph = await fastify.prisma.graph.findMany({
      where: {
        name: req.query.graph_name,
        isActive: true,
      },
    })
    if (!graph) {
      throw InvalidGraphNameError(req.query.graph_name)
    }

    const serviceModels = await fastify.prisma.service.findMany({
      select: {
        name: true,
      },
    })
    const allServiceNames = serviceModels.map((s) => s.name)
    const allServiceVersions = allServiceNames.map((s) => ({
      name: s,
    }))

    if (!allServiceNames.length) {
      return res.send({
        success: true,
        data: [],
      })
    }

    const schmemaService = new SchemaService(fastify.prisma)
    const { schemas, error: findError } = await schmemaService.findByServiceVersions(
      req.query.graph_name,
      allServiceVersions,
    )

    if (findError) {
      throw SchemaVersionLookupError(findError.message)
    }

    if (!schemas.length) {
      return res.send({
        success: true,
        data: [],
      })
    }

    const serviceSchemas = schemas.map((s) => ({
      name: s.serviceName,
      typeDefs: s.typeDefs,
    }))

    const { error: schemaError } = composeAndValidateSchema(serviceSchemas)

    if (schemaError) {
      throw SchemaCompositionError(schemaError)
    }

    return {
      success: true,
      data: schemas,
    }
  })
}
