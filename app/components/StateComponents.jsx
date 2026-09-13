/* eslint-disable react/prop-types -- Internal presentation components, matching DeliveryOptions. */
import {
  Box,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Icon,
  Spinner,
} from "@shopify/polaris";
import { AlertIcon, CheckCircleIcon } from "@shopify/polaris-icons";

export function LoadingState({ message = "Loading..." }) {
  return (
    <Box padding="600" role="status">
      <BlockStack gap="300" inlineAlign="center">
        <Spinner accessibilityLabel={message} size="large" />
        <Text as="p" tone="subdued">
          {message}
        </Text>
      </BlockStack>
    </Box>
  );
}

export function ErrorState({ error, onRetry, title = "Something went wrong" }) {
  return (
    <Box padding="600" background="bg-fill" borderRadius="200">
      <BlockStack gap="300">
        <InlineStack gap="200" blockAlign="start" wrap={false}>
          <Icon source={AlertIcon} tone="critical" />
          <BlockStack gap="100">
            <Text as="h3" variant="headingMd" tone="critical">
              {title}
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              {(error instanceof Error ? error.message : error) ||
                "An unexpected error occurred. Please try again."}
            </Text>
          </BlockStack>
        </InlineStack>
        {onRetry && (
          <Button onClick={onRetry} variant="primary" size="small">
            Try Again
          </Button>
        )}
      </BlockStack>
    </Box>
  );
}

export function SuccessState({ message = "Success!", onClose }) {
  return (
    <Box
      padding="400"
      background="bg-fill-success"
      borderRadius="200"
      role="status"
    >
      <InlineStack gap="200" blockAlign="center">
        <Icon source={CheckCircleIcon} tone="success" />
        <Text as="p" variant="bodySm" tone="success">
          {message}
        </Text>
        {onClose && (
          <Button onClick={onClose} variant="plain" size="small">
            Dismiss
          </Button>
        )}
      </InlineStack>
    </Box>
  );
}

export function EmptyState({
  title = "No items",
  description = "Create your first item to get started.",
  action = null,
  icon = null,
}) {
  return (
    <Box padding="600">
      <BlockStack gap="400" inlineAlign="center">
        {icon && (
          <Box
            width="64px"
            minHeight="64px"
            background="bg-fill"
            borderRadius="300"
            padding="400"
          >
            <Icon source={icon} tone="subdued" />
          </Box>
        )}
        <BlockStack gap="200">
          <Text as="h3" variant="headingMd">
            {title}
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            {description}
          </Text>
        </BlockStack>
        {action && <Box>{action}</Box>}
      </BlockStack>
    </Box>
  );
}
