import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

const schema = a.schema({
  Word: a
    .model({
      id: a.id().required(),
      word: a.string().required(),
      meaning: a.string().required(),
      category_ids: a.integer().array().required(),
      del_flg: a.integer(),
      supplement: a.string(),
      example: a.string(),
      description: a.string(),
      status: a.integer().required(),
    })
    .identifier(['id'])
    .secondaryIndexes((index) => [index('status').name('byStatus').queryField('wordsByStatus')])
    .authorization((allow) => [allow.publicApiKey()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'apiKey',
    apiKeyAuthorizationMode: {
      expiresInDays: 365,
    },
  },
});
