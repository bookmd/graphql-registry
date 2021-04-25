import test from 'ava'
import { createEmptyKVNamespaces, Request, Response } from '../test-utils'
import { ErrorResponse } from '../types'
import { getSchemaDiff } from './get-schema-diff'
import { registerSchema } from './register-schema'

test.serial('Should calculate schema diff', async (t) => {
  createEmptyKVNamespaces(['GRAPHS', 'SERVICES', 'SCHEMAS', 'VERSIONS'])

  let req = Request('POST', '', {
    type_defs: 'type Query { hello: String }',
    version: '1',
    service_name: 'foo',
    graph_name: 'my_graph',
  })
  let res = Response()
  await registerSchema(req, res)

  t.is(res.statusCode, 200)

  req = Request('POST', '', {
    graph_name: 'my_graph',
    service_name: 'foo',
    type_defs: 'type Query { hello: String world: String }',
  })
  res = Response()
  await getSchemaDiff(req, res)
  t.is(res.statusCode, 200)
  t.deepEqual(res.body as any, {
    success: true,
    data: [
      {
        criticality: {
          level: 'NON_BREAKING',
        },
        type: 'FIELD_ADDED',
        message: "Field 'world' was added to object type 'Query'",
        path: 'Query.world',
      },
    ],
  })
})

test.serial('Should detect a breaking change', async (t) => {
  createEmptyKVNamespaces(['GRAPHS', 'SERVICES', 'SCHEMAS', 'VERSIONS'])

  let req = Request('POST', '', {
    type_defs: 'type Query { hello: String world: String }',
    version: '1',
    service_name: 'foo',
    graph_name: 'my_graph',
  })
  let res = Response()
  await registerSchema(req, res)

  t.is(res.statusCode, 200)

  req = Request('POST', '', {
    graph_name: 'my_graph',
    service_name: 'foo',
    type_defs: 'type Query { hello: String }',
  })
  res = Response()
  await getSchemaDiff(req, res)
  t.is(res.statusCode, 200)
  t.deepEqual(res.body as any, {
    success: true,
    data: [
      {
        criticality: {
          level: 'BREAKING',
          reason:
            'Removing a field is a breaking change. It is preferable to deprecate the field before removing it.',
        },
        type: 'FIELD_REMOVED',
        message: "Field 'world' was removed from object type 'Query'",
        path: 'Query.world',
      },
    ],
  })
})

test.serial('Should return 400 when type_defs is missing', async (t) => {
  createEmptyKVNamespaces(['GRAPHS', 'SERVICES', 'SCHEMAS', 'VERSIONS'])

  let req = Request('POST', '', {
    graph_name: 'my_graph',
    service_name: 'foo',
  })
  let res = Response()
  await getSchemaDiff(req, res)

  const body = (res.body as any) as ErrorResponse

  t.is(res.statusCode, 400)
  t.is(body.success, false)
})
