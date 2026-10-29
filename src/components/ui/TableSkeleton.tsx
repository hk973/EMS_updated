"use client";

import React from "react";
import { TableRow, TableCell, Box } from "@mui/material";

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

export default function TableSkeleton({
  rows = 6,
  columns = 6,
}: TableSkeletonProps) {
  const widths = ["65%", "85%", "45%", "70%", "55%", "90%"];

  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <TableRow
          key={`skel-row-${rowIndex}`}
          sx={{
            "&:last-child td, &:last-child th": { border: 0 },
            borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
          }}
        >
          {Array.from({ length: columns }).map((_, colIndex) => {
            const width = widths[(rowIndex + colIndex) % widths.length];

            return (
              <TableCell key={`skel-cell-${colIndex}`} sx={{ py: 2 }}>
                <Box
                  sx={{
                    height: 16,
                    width: colIndex === 0 ? 32 : width,
                    borderRadius: colIndex === 0 ? "50%" : "6px",
                    background:
                      "linear-gradient(90deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 100%)",
                    backgroundSize: "200% 100%",
                    animation: "shimmer 1.8s infinite ease-in-out",
                    "@keyframes shimmer": {
                      "0%": {
                        backgroundPosition: "-200% 0",
                      },
                      "100%": {
                        backgroundPosition: "200% 0",
                      },
                    },
                  }}
                />
              </TableCell>
            );
          })}
        </TableRow>
      ))}
    </>
  );
}
