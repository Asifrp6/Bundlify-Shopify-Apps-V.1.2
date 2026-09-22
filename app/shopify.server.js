import "@shopify/shopify-app-react-router/adapters/node";

import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";

import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";

import prisma from "./db.server";
import { reconcileSavedResources } from "./services/reinstall.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,

  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",

  apiVersion: ApiVersion.July26,

  scopes: process.env.SCOPES?.split(","),

  appUrl: process.env.SHOPIFY_APP_URL || "",

  authPathPrefix: "/auth",

  sessionStorage: new PrismaSessionStorage(prisma),

  distribution: AppDistribution.AppStore,

  hooks: {
    afterAuth: async ({ session, admin }) => {
      try {
        await reconcileSavedResources({ db: prisma, admin, shop: session.shop });
      } catch (error) {
        // Retry reconciliation on the next authentication.
        await prisma.session.deleteMany({ where: { id: session.id, accessToken: session.accessToken } });
        throw error;
      }
    },
  },

  future: {
    expiringOfflineAccessTokens: true,
  },
});

export default shopify;

export const apiVersion = ApiVersion.July26;

export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;

export const authenticate = shopify.authenticate;

export const unauthenticated = shopify.unauthenticated;

export const login = shopify.login;

export const registerWebhooks = shopify.registerWebhooks;

export const sessionStorage = shopify.sessionStorage;
