/* tslint:disable */
/* eslint-disable */
// this is an auto generated file. This will be overwritten

export const onCreateWord = /* GraphQL */ `
  subscription OnCreateWord($filter: ModelSubscriptionWordFilterInput) {
    onCreateWord(filter: $filter) {
      id
      word
      meaning
      category_ids
      supplement
      example
      description
      status
      createdAt
      updatedAt
      __typename
    }
  }
`;
export const onUpdateWord = /* GraphQL */ `
  subscription OnUpdateWord($filter: ModelSubscriptionWordFilterInput) {
    onUpdateWord(filter: $filter) {
      id
      word
      meaning
      category_ids
      supplement
      example
      description
      status
      createdAt
      updatedAt
      __typename
    }
  }
`;
export const onDeleteWord = /* GraphQL */ `
  subscription OnDeleteWord($filter: ModelSubscriptionWordFilterInput) {
    onDeleteWord(filter: $filter) {
      id
      word
      meaning
      category_ids
      supplement
      example
      description
      status
      createdAt
      updatedAt
      __typename
    }
  }
`;
