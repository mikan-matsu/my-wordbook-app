/* tslint:disable */
/* eslint-disable */
// this is an auto generated file. This will be overwritten

export const createWord = /* GraphQL */ `
  mutation CreateWord(
    $input: CreateWordInput!
    $condition: ModelWordConditionInput
  ) {
    createWord(input: $input, condition: $condition) {
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
export const updateWord = /* GraphQL */ `
  mutation UpdateWord(
    $input: UpdateWordInput!
    $condition: ModelWordConditionInput
  ) {
    updateWord(input: $input, condition: $condition) {
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
export const deleteWord = /* GraphQL */ `
  mutation DeleteWord(
    $input: DeleteWordInput!
    $condition: ModelWordConditionInput
  ) {
    deleteWord(input: $input, condition: $condition) {
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
