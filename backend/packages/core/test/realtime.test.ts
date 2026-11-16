import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseRealtimeEvent, toRealtimeSignal } from '../src/lib/realtime.ts'

describe('parseRealtimeEvent', () => {
  it('accepts the two events the dashboard listens for', () => {
    assert.deepEqual(parseRealtimeEvent('{"type":"conversation.updated","orgId":"o1","conversationId":"c1"}'), {
      type: 'conversation.updated',
      orgId: 'o1',
      conversationId: 'c1',
    })
    assert.deepEqual(parseRealtimeEvent('{"type":"campaign.updated","orgId":"o1","campaignId":"k1"}'), {
      type: 'campaign.updated',
      orgId: 'o1',
      campaignId: 'k1',
    })
  })

  it('rejects anything that could not be routed: no org, unknown type, the wrong id, or not JSON', () => {
    assert.equal(parseRealtimeEvent('{"type":"conversation.updated","conversationId":"c1"}'), null)
    assert.equal(parseRealtimeEvent('{"type":"message.created","orgId":"o1","conversationId":"c1"}'), null)
    assert.equal(parseRealtimeEvent('{"type":"campaign.updated","orgId":"o1","conversationId":"c1"}'), null)
    assert.equal(parseRealtimeEvent('bukan json'), null)
  })

  it('drops fields it does not know, so a publisher cannot smuggle content to browsers', () => {
    const event = parseRealtimeEvent(
      '{"type":"conversation.updated","orgId":"o1","conversationId":"c1","body":"isi pesan"}',
    )
    assert.deepEqual(event, { type: 'conversation.updated', orgId: 'o1', conversationId: 'c1' })
  })
})

describe('toRealtimeSignal', () => {
  it('strips the orgId before an event goes to a browser', () => {
    assert.deepEqual(toRealtimeSignal({ type: 'campaign.updated', orgId: 'o1', campaignId: 'k1' }), {
      type: 'campaign.updated',
      campaignId: 'k1',
    })
  })
})
