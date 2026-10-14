import type { components, operations } from "./schema"

type Json<T> = T extends { content: { "application/json": infer B } }
  ? B
  : never

export type Ok<O extends keyof operations> =
  operations[O]["responses"] extends { 200: infer R } ? Json<R> : never

export type FolderListing = Ok<"listFolder">
export type DriveNode = FolderListing["items"][number]
export type Role = FolderListing["role"]
export type SharedNode = Ok<"listSharedWithMe">["items"][number]
export type Me = Ok<"getMe">
export type Share = Ok<"listShares">["items"][number]
export type PublicLink = Ok<"createLink">
export type PublicListing = Ok<"getPublicLink">
export type PublicNode = PublicListing["items"][number]
export type AdminUser = Ok<"listUsers">["items"][number]
export type Settings = Ok<"getSettings">

export type { components }
