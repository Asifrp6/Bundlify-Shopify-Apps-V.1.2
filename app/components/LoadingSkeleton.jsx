import {
  Card,
  BlockStack,
  Box,
  InlineStack,
  SkeletonBodyText,
} from "@shopify/polaris";

export function SkeletonCard() {
  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="300">
          <SkeletonBodyText lines={3} />
        </BlockStack>
      </Box>
    </Card>
  );
}

export function SkeletonTableRow() {
  return (
    <Box padding="400" borderBlockEndWidth="025" borderColor="border">
      <InlineStack gap="400" wrap={false}>
        {Array.from({ length: 4 }, (_, index) => (
          <Box key={index} width="25%">
            <SkeletonBodyText lines={1} />
          </Box>
        ))}
      </InlineStack>
    </Box>
  );
}

// eslint-disable-next-line react/prop-types -- Internal presentation component with a default count.
export function LoadingSkeletonList({ count = 3 }) {
  return (
    <BlockStack gap="300">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </BlockStack>
  );
}
