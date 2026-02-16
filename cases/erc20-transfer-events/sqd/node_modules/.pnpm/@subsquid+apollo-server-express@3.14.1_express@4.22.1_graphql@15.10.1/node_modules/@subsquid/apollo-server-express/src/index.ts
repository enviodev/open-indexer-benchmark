export {
  GraphQLOptions,
  Config,
  gql,
  // Errors
  ApolloError,
  toApolloError,
  SyntaxError,
  ValidationError,
  AuthenticationError,
  ForbiddenError,
  UserInputError,
} from '@subsquid/apollo-server-core';

// ApolloServer integration.
export {
  ApolloServer,
  ServerRegistration,
  GetMiddlewareOptions,
  ApolloServerExpressConfig,
  ExpressContext,
} from './ApolloServer';

export { CorsOptions } from 'cors';
export { OptionsJson } from 'body-parser';
