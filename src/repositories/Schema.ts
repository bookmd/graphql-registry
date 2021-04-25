import * as DB from 'worktop/kv'
import fnv1a from '@sindresorhus/fnv1a'
import type { KV } from 'worktop/kv'
import { sort } from 'fast-sort'
import { ulid } from 'worktop/utils'

// cloudflare global kv binding
declare const SCHEMAS: KV.Namespace

export interface Schema {
  uid: string
  graph_name: string
  service_name: string
  is_active: boolean
  hash: string
  type_defs: string
  updated_at: number | null
  created_at: number
}

export interface SchemaIndex {
  uid: string
  service_name: string
  graph_name: string
  hash: string
}

export type NewSchema = Omit<
  Schema,
  'created_at' | 'updated_at' | 'uid' | 'hash'
>

export const key_owner = (graph_name: string) =>
  `graphs::${graph_name}::schemas`
export const key_item = (graph_name: string, uid: string) =>
  `graphs::${graph_name}::schemas::${uid}`

export function find(graph_name: string, uid: string) {
  const key = key_item(graph_name, uid)
  return DB.read<Schema>(SCHEMAS, key, 'json')
}

export async function findByHash(graph_name: string, hash: string) {
  const all = await list(graph_name)
  return all.find((s) => s.hash === hash)
}

export async function list(graph_name: string): Promise<SchemaIndex[]> {
  const key = key_owner(graph_name)
  return (await DB.read<SchemaIndex[]>(SCHEMAS, key, 'json')) || []
}

export function syncIndex(graph_name: string, versions: SchemaIndex[]) {
  const key = key_owner(graph_name)
  return DB.write(SCHEMAS, key, versions)
}

export function remove(graph_name: string, uid: string) {
  const key = key_item(graph_name, uid)
  return DB.remove(SCHEMAS, key)
}

export function save(item: Schema) {
  const key = key_item(item.graph_name, item.uid)
  return DB.write(SCHEMAS, key, item)
}

export async function insert(schema: NewSchema) {
  const values: Schema = {
    uid: ulid(),
    graph_name: schema.graph_name,
    hash: fnv1a(schema.type_defs).toString(),
    service_name: schema.service_name,
    is_active: schema.is_active,
    type_defs: schema.type_defs,
    created_at: Date.now(),
    updated_at: null,
  }

  if (!(await save(values))) {
    return false
  }

  let allSchemas = (await list(schema.graph_name)).concat({
    uid: values.uid,
    service_name: values.service_name,
    graph_name: values.graph_name,
    hash: values.hash,
  })

  const sorted = sort(allSchemas).desc((u) => u.uid)

  if (!(await syncIndex(schema.graph_name, sorted))) {
    return false
  }

  return values
}
