/* tslint:disable */
/* eslint-disable */
// this is an auto generated file. This will be overwritten

export const getWord = /* GraphQL */ `
  query GetWord($id: ID!) {
    getWord(id: $id) {
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
export const listWords = /* GraphQL */ `
  query ListWords(
    $id: ID
    $filter: ModelWordFilterInput
    $limit: Int
    $nextToken: String
    $sortDirection: ModelSortDirection
  ) {
    listWords(
      id: $id
      filter: $filter
      limit: $limit
      nextToken: $nextToken
      sortDirection: $sortDirection
    ) {
      items {
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
      nextToken
      __typename
    }
  }
`;
export const wordsByStatus = /* GraphQL */ `
  query WordsByStatus(
    $status: Int!
    $sortDirection: ModelSortDirection
    $filter: ModelWordFilterInput
    $limit: Int
    $nextToken: String
  ) {
    wordsByStatus(
      status: $status
      sortDirection: $sortDirection
      filter: $filter
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
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
      nextToken
      __typename
    }
  }
`;
