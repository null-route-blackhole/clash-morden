import { alpha, Box, Typography } from "@mui/material";

export interface CardLegendItem {
  key: string;
  label: string;
  color: string;
  count?: number;
  gradient?: string;
}

export const CardLegend = ({ items }: { items: CardLegendItem[] }) => (
  <Box
    className="card-legend"
    sx={{
      display: "flex",
      alignItems: "center",
      flexWrap: "wrap",
      justifyContent: "flex-end",
      gap: 0.5,
      minWidth: 0,
    }}>
    {items.map(({ key, label, color, count, gradient }) => (
      <Box
        key={key}
        className="card-legend-item"
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.35,
          px: 0.7,
          py: 0.25,
          borderRadius: 1,
          bgcolor: alpha(color, 0.08),
          color: "text.secondary",
          whiteSpace: "nowrap",
        }}>
        <Box
          className="card-legend-dot"
          sx={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            bgcolor: color,
            backgroundImage: gradient,
            flexShrink: 0,
          }}
        />
        <Typography
          variant="caption"
          sx={{
            fontSize: 10,
            fontWeight: 400,
            lineHeight: 1.2,
            color: "text.secondary",
          }}>
          {label}
          {count === undefined ? "" : ` ${count}`}
        </Typography>
      </Box>
    ))}
  </Box>
);
