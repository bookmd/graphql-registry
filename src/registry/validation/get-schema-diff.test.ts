import anyTest, { TestInterface } from 'ava'
import build from '../../build-server'
import { cleanTest, createTestContext, createTestPrefix, TestContext } from '../../core/test-util'

const test = anyTest as TestInterface<TestContext>
test.before(createTestContext())
test.beforeEach(createTestPrefix())
test.after.always('cleanup', cleanTest())

test('Should calculate schema diff', async (t) => {
  const app = build({
    databaseConnectionUrl: t.context.connectionUrl,
  })
  t.teardown(() => app.prisma.$disconnect())

  let res = await app.inject({
    method: 'POST',
    url: '/schema/push',
    payload: {
      type_defs: `type Query { hello: String }`,
      version: '1',
      service_name: `${t.context.testPrefix}_foo`,
      graph_name: `${t.context.graphName}`,
    },
  })

  t.is(res.statusCode, 200)

  res = await app.inject({
    method: 'POST',
    url: '/schema/diff',
    payload: {
      type_defs: `type Query { hello: String world: String }`,
      service_name: `${t.context.testPrefix}_foo`,
      graph_name: `${t.context.graphName}`,
    },
  })

  t.is(res.statusCode, 200)

  t.deepEqual(
    res.json(),
    {
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
    },
    'response payload match',
  )
})

test('Should detect a breaking change', async (t) => {
  const app = build({
    databaseConnectionUrl: t.context.connectionUrl,
  })
  t.teardown(() => app.prisma.$disconnect())

  let res = await app.inject({
    method: 'POST',
    url: '/schema/push',
    payload: {
      type_defs: `type Query { hello: String world: String }`,
      version: '1',
      service_name: `${t.context.testPrefix}_foo`,
      graph_name: `${t.context.graphName}`,
    },
  })

  t.is(res.statusCode, 200)

  res = await app.inject({
    method: 'POST',
    url: '/schema/diff',
    payload: {
      type_defs: `type Query { hello: String }`,
      service_name: `${t.context.testPrefix}_foo`,
      graph_name: `${t.context.graphName}`,
    },
  })

  t.is(res.statusCode, 200)

  t.deepEqual(
    res.json(),
    {
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
    },
    'response payload match',
  )
})

test('Should return 400 because type_def is missing', async (t) => {
  const app = build({
    databaseConnectionUrl: t.context.connectionUrl,
  })
  t.teardown(() => app.prisma.$disconnect())

  let res = await app.inject({
    method: 'POST',
    url: '/schema/diff',
    payload: {
      service_name: `${t.context.testPrefix}_foo`,
      graph_name: `${t.context.graphName}`,
    },
  })

  t.is(res.statusCode, 400)
  t.deepEqual(
    res.json(),
    {
      success: false,
      error: "body should have required property 'type_defs'",
    },
    'message',
  )
})