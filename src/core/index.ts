import * as base58 from 'base58-universal/main.js'
import { CryptoSystem } from 'keystore-idb/types'
import utils from 'keystore-idb/utils'

import { base64 } from '../common'

import * as api from './api'
import * as keystore from '../keystore'


const EDW_DID_PREFIX: ArrayBuffer = new Uint8Array([ 0xed, 0x01 ]).buffer
const RSA_DID_PREFIX: ArrayBuffer = new Uint8Array([ 0x00, 0xf5, 0x02 ]).buffer


/**
 * Get the DID from the main Fission API.
 */
export async function apiDid() { return await api.did() }

/**
 * Get the endpoint from the main Fission API.
 */
export function apiEndpoint() { return `https://${api.HOST}` }

/**
 * Create a DID to authenticate with.
 */
export const did = async (): Promise<string> => {
  const ks = await keystore.get()

  // Public-write key
  const pwB64 = await ks.publicWriteKey()
  const pwBuf = utils.base64ToArrBuf(pwB64)

  // Prefix public-write key
  const prefix = magicBytes(ks.cfg.type) || new ArrayBuffer(0)
  const prefixedBuf = utils.joinBufs(prefix, pwBuf)

  // Encode prefixed
  return 'did:key:z' + base58.encode(new Uint8Array(prefixedBuf))
}

/**
 * Create a UCAN, User Controlled Authorization Networks, JWT.
 * This JWT can be used for authorization.
 *
 * ## Header
 *
 * `alg`, Algorithm, the type of signature.
 * `typ`, Type, the type of this data structure, JWT.
 * `uav`, UCAN version.
 *
 * ## Body
 *
 * `aud`, Audience, the ID of who it's intended for.
 * `exp`, Expiry, unix timestamp of when the jwt is no longer valid.
 * `iss`, Issuer, the ID of who sent this.
 * `nbf`, Not Before, unix timestamp of when the jwt becomes valid.
 * `prf`, Proof, an optional nested token with equal or greater privileges.
 * `ptc`, Potency, which rights come with the token.
 * `rsc`, Resource, the path of the things that can be changed.
 *
 */
export const ucan = async ({
  audience,
  issuer,
  lifetimeInSeconds = 30,
  proof,
  resource = "/"
}: {
  audience: string
  issuer: string
  lifetimeInSeconds?: number
  proof?: string
  resource?: string
}): Promise<string> => {
  const ks = await keystore.get()
  const currentTimeInSeconds = Math.floor(Date.now() / 1000)

  // Parts
  const header = {
    alg: jwtAlgorithm(ks.cfg.type) || 'UnknownAlgorithm',
    typ: 'JWT',
    uav: '0.1.0',
  }

  const payload = {
    aud: audience,
    exp: currentTimeInSeconds + lifetimeInSeconds,
    iss: issuer,
    nbf: currentTimeInSeconds - 60,
    prf: proof,
    ptc: "APPEND",
    scp: resource, // TODO: scp -> rsc
  }

  // Encode parts in JSON & Base64Url
  const encodedHeader = base64.urlEncode(JSON.stringify(header))
  const encodedPayload = base64.urlEncode(JSON.stringify(payload))

  // Signature
  const signed = await ks.sign(`${encodedHeader}.${encodedPayload}`, { charSize: 8 })
  const encodedSignature = base64.makeUrlSafe(signed)

  // Make JWT
  return encodedHeader + '.' +
         encodedPayload + '.' +
         encodedSignature
}



// ㊙️


/**
 * JWT algorithm to be used in a JWT header.
 */
function jwtAlgorithm(cryptoSystem: CryptoSystem): string | null {
  switch (cryptoSystem) {
    case CryptoSystem.RSA: return 'RS256';
    default: return null
  }
}


/**
 * Magic bytes
 */
function magicBytes(cryptoSystem: CryptoSystem): ArrayBuffer | null {
  switch (cryptoSystem) {
    case CryptoSystem.RSA: return RSA_DID_PREFIX;
    default: return null
  }
}