import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  PageBreak,
  ShadingType,
  Header,
  Footer,
  PageNumber
} from "docx";
import { DocxOptions } from "./types.js";

export async function generateBinaryDocx(opts: DocxOptions): Promise<Buffer> {
  const children: any[] = [];

  // 1. Cover / Title Page
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "GOOGLE ACADEMY COMPANION  •  ACADEMIC STUDY GUIDE",
          bold: true,
          size: 18,
          color: "475569"
        })
      ],
      spacing: { after: 140 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: opts.title,
          bold: true,
          size: 40,
          color: "0F172A"
        })
      ],
      spacing: { after: 180 }
    })
  );

  if (opts.subtitle) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: opts.subtitle,
            italics: true,
            size: 22,
            color: "334155"
          })
        ],
        spacing: { after: 200 }
      })
    );
  }

  // Metadata Table
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      margins: { top: 140, bottom: 140, left: 180, right: 180 },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: "Subject Domain: ", bold: true, size: 19 }),
                    new TextRun({ text: opts.subject, size: 19 })
                  ],
                  spacing: { after: 60 }
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: "Learning Target: ", bold: true, size: 19 }),
                    new TextRun({ text: opts.learningGoal || "Comprehensive Curriculum Mastery", size: 19 })
                  ],
                  spacing: { after: 60 }
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: "Document Type: ", bold: true, size: 19 }),
                    new TextRun({ text: opts.documentType, size: 19 })
                  ],
                  spacing: { after: 60 }
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: "Generation Date: ", bold: true, size: 19 }),
                    new TextRun({ text: `${new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}  •  Academic Engine v2.0`, size: 19 })
                  ]
                })
              ],
              shading: { type: ShadingType.CLEAR, fill: "F8FAFC" },
              borders: {
                left: { style: BorderStyle.SINGLE, size: 24, color: "1E3A8A" },
                top: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
                right: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
                bottom: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" }
              }
            })
          ]
        })
      ]
    }),
    new Paragraph({ children: [new PageBreak()] })
  );

  // Table of Contents
  if (opts.tableOfContents && opts.tableOfContents.length) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Curriculum Trajectory & Chapter Index",
            bold: true,
            size: 28,
            color: "0F172A"
          })
        ],
        spacing: { before: 180, after: 140 }
      })
    );

    for (let i = 0; i < opts.tableOfContents.length; i++) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `Chapter ${i + 1}: `, bold: true, color: "1E3A8A", size: 20 }),
            new TextRun({ text: opts.tableOfContents[i], size: 20 })
          ],
          spacing: { after: 80 }
        })
      );
    }
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // 2. Specialized: Quiz Questions in Word
  if (opts.quizQuestions && opts.quizQuestions.length) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Examination Assessment & Model Solutions",
            bold: true,
            size: 30,
            color: "0F172A"
          })
        ],
        spacing: { before: 180, after: 120 }
      })
    );

    for (const q of opts.quizQuestions) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `Question ${q.questionNumber}`, bold: true, size: 22, color: "1E3A8A" }),
            new TextRun({ text: q.conceptTested ? `  [ Concept: ${q.conceptTested} ]` : "", italics: true, size: 18, color: "64748B" })
          ],
          spacing: { before: 200, after: 80 }
        }),
        new Paragraph({
          children: [new TextRun({ text: q.question, bold: true, size: 20 })],
          spacing: { after: 100 }
        })
      );

      for (let oi = 0; oi < q.options.length; oi++) {
        const letter = String.fromCharCode(65 + oi);
        const isCorrect = q.options[oi] === q.correctAnswer;
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: `[ ${letter} ] `, bold: true, color: isCorrect ? "15803D" : "475569", size: 19 }),
              new TextRun({ text: q.options[oi], size: 19 })
            ],
            indent: { left: 360 },
            spacing: { after: 60 }
          })
        );
      }

      // Solution Callout
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          margins: { top: 100, bottom: 100, left: 140, right: 140 },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({ text: `Correct Answer: ${q.correctAnswer}`, bold: true, color: "15803D", size: 18 })
                      ],
                      spacing: { after: 40 }
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({ text: `Conceptual Rationale: ${q.explanation}`, size: 18, color: "334155" })
                      ]
                    })
                  ],
                  shading: { type: ShadingType.CLEAR, fill: "F0FDF4" },
                  borders: {
                    left: { style: BorderStyle.SINGLE, size: 20, color: "15803D" },
                    top: { style: BorderStyle.NONE },
                    right: { style: BorderStyle.NONE },
                    bottom: { style: BorderStyle.NONE }
                  }
                })
              ]
            })
          ]
        })
      );
    }
  }

  // 3. Specialized: Flashcards in Word
  else if (opts.flashcards && opts.flashcards.length) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Active Retrieval Flashcard Master Deck",
            bold: true,
            size: 30,
            color: "0F172A"
          })
        ],
        spacing: { before: 180, after: 120 }
      })
    );

    for (const fc of opts.flashcards) {
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          margins: { top: 120, bottom: 120, left: 160, right: 160 },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({ text: `CARD #${fc.cardNumber}`, bold: true, color: "1E3A8A", size: 18 }),
                        new TextRun({ text: fc.relatedConcept ? `  •  Target Concept: ${fc.relatedConcept}` : "", size: 16, color: "64748B" })
                      ],
                      spacing: { after: 60 }
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({ text: "PROMPT / QUESTION: ", bold: true, size: 18 }),
                        new TextRun({ text: fc.front, size: 19 })
                      ],
                      spacing: { after: 80 }
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({ text: "RETRIEVAL ANSWER: ", bold: true, color: "15803D", size: 18 }),
                        new TextRun({ text: fc.back, size: 19 })
                      ]
                    })
                  ],
                  shading: { type: ShadingType.CLEAR, fill: "F8FAFC" },
                  borders: {
                    top: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" },
                    left: { style: BorderStyle.SINGLE, size: 18, color: "1E3A8A" },
                    right: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" },
                    bottom: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" }
                  }
                })
              ]
            })
          ]
        }),
        new Paragraph({ spacing: { after: 120 } })
      );
    }
  }

  // 4. Specialized: Practice Worksheets in Word
  else if (opts.practiceExercises && opts.practiceExercises.length) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Comprehensive Practice Problem Worksheets",
            bold: true,
            size: 30,
            color: "0F172A"
          })
        ],
        spacing: { before: 180, after: 120 }
      })
    );

    for (const ex of opts.practiceExercises) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `Exercise ${ex.exerciseNumber}: ${ex.title}`, bold: true, size: 24, color: "0F172A" }),
            new TextRun({ text: ex.difficulty ? `  [ ${ex.difficulty.toUpperCase()} ]` : "", bold: true, size: 18, color: "1E3A8A" })
          ],
          spacing: { before: 240, after: 100 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Scenario Context: ", bold: true, size: 19, color: "1E3A8A" }),
            new TextRun({ text: ex.scenario, size: 19 })
          ],
          spacing: { after: 80 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Problem Statement: ", bold: true, size: 19 }),
            new TextRun({ text: ex.problemStatement, bold: true, size: 19 })
          ],
          spacing: { after: 80 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: "Expected Deliverable: ", bold: true, size: 18, color: "475569" }),
            new TextRun({ text: ex.deliverable, italics: true, size: 18 })
          ],
          spacing: { after: 100 }
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          margins: { top: 120, bottom: 120, left: 160, right: 160 },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({ text: "MODEL SOLUTION WALKTHROUGH:", bold: true, size: 18, color: "1E3A8A" })
                      ],
                      spacing: { after: 60 }
                    }),
                    new Paragraph({
                      children: [new TextRun({ text: ex.solutionWalkthrough, size: 18 })]
                    })
                  ],
                  shading: { type: ShadingType.CLEAR, fill: "F8FAFC" },
                  borders: {
                    left: { style: BorderStyle.SINGLE, size: 24, color: "1E3A8A" },
                    top: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
                    right: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
                    bottom: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" }
                  }
                })
              ]
            })
          ]
        }),
        new Paragraph({ spacing: { after: 160 } })
      );
    }
  }

  // 5. Standard Sections (Detailed Notes / Short Notes / Module Notes)
  else {
    for (let si = 0; si < opts.sections.length; si++) {
      const sec = opts.sections[si];

      if (si > 0) {
        children.push(new Paragraph({ children: [new PageBreak()] }));
      }

      // Chapter Heading (H1)
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: sec.heading,
              bold: true,
              size: 28,
              color: "0F172A"
            })
          ],
          spacing: { before: 240, after: 100 }
        })
      );

      if (sec.subheading) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: sec.subheading,
                italics: true,
                size: 20,
                color: "475569"
              })
            ],
            spacing: { after: 120 }
          })
        );
      }

      // Callout Box
      if (sec.callout) {
        children.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            margins: { top: 120, bottom: 120, left: 160, right: 160 },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({ text: "KEY CONCEPT & INVARIANT", bold: true, size: 16, color: "1E3A8A" })
                        ],
                        spacing: { after: 40 }
                      }),
                      new Paragraph({
                        children: [new TextRun({ text: sec.callout, size: 19 })]
                      })
                    ],
                    shading: { type: ShadingType.CLEAR, fill: "F8FAFC" },
                    borders: {
                      left: { style: BorderStyle.SINGLE, size: 24, color: "1E3A8A" },
                      top: { style: BorderStyle.NONE },
                      right: { style: BorderStyle.NONE },
                      bottom: { style: BorderStyle.NONE }
                    }
                  })
                ]
              })
            ]
          }),
          new Paragraph({ spacing: { after: 100 } })
        );
      }

      // Paragraphs
      for (const p of sec.paragraphs) {
        if (!p) continue;
        const plines = p.split("\n");
        for (const pl of plines) {
          const trimmed = pl.trim();
          if (!trimmed) continue;

          if (trimmed.startsWith("### ")) {
            children.push(
              new Paragraph({
                children: [new TextRun({ text: trimmed.replace(/^###\s+/, ""), bold: true, size: 22, color: "1E293B" })],
                spacing: { before: 180, after: 80 }
              })
            );
          } else if (trimmed.startsWith("## ")) {
            children.push(
              new Paragraph({
                children: [new TextRun({ text: trimmed.replace(/^##\s+/, ""), bold: true, size: 24, color: "0F172A" })],
                spacing: { before: 220, after: 100 }
              })
            );
          } else if (trimmed.startsWith("# ")) {
            children.push(
              new Paragraph({
                children: [new TextRun({ text: trimmed.replace(/^#\s+/, ""), bold: true, size: 26, color: "0F172A" })],
                spacing: { before: 240, after: 120 }
              })
            );
          } else if (/^[\*\-\•]\s+/.test(trimmed)) {
            children.push(
              new Paragraph({
                children: [
                  new TextRun({ text: "•  ", bold: true, color: "1E3A8A" }),
                  new TextRun({ text: trimmed.replace(/^[\*\-\•]\s+/, ""), size: 19 })
                ],
                indent: { left: 280 },
                spacing: { after: 60 }
              })
            );
          } else {
            children.push(
              new Paragraph({
                children: [new TextRun({ text: trimmed, size: 19 })],
                spacing: { after: 80 }
              })
            );
          }
        }
      }

      // Bullets
      if (sec.bullets && sec.bullets.length) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: "Key Principles & Takeaways:", bold: true, size: 20, color: "0F172A" })],
            spacing: { before: 140, after: 80 }
          })
        );
        for (const b of sec.bullets) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: "•  ", bold: true, color: "1E3A8A" }),
                new TextRun({ text: b, size: 19 })
              ],
              indent: { left: 280 },
              spacing: { after: 60 }
            })
          );
        }
      }

      // Worked Examples
      if (sec.examples && sec.examples.length) {
        for (const ex of sec.examples) {
          children.push(
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              margins: { top: 120, bottom: 120, left: 160, right: 160 },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [new TextRun({ text: `WORKED EXAMPLE: ${ex.title}`, bold: true, size: 20, color: "1E3A8A" })],
                          spacing: { after: 60 }
                        }),
                        new Paragraph({
                          children: [
                            new TextRun({ text: "Scenario: ", bold: true, size: 18 }),
                            new TextRun({ text: ex.scenario, italics: true, size: 18 })
                          ],
                          spacing: { after: 60 }
                        }),
                        new Paragraph({
                          children: [
                            new TextRun({ text: "Step-by-Step Model Solution: ", bold: true, color: "15803D", size: 18 }),
                            new TextRun({ text: ex.solution, size: 18 })
                          ]
                        })
                      ],
                      shading: { type: ShadingType.CLEAR, fill: "F8FAFC" },
                      borders: {
                        top: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
                        left: { style: BorderStyle.SINGLE, size: 20, color: "1E3A8A" },
                        right: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
                        bottom: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" }
                      }
                    })
                  ]
                })
              ]
            }),
            new Paragraph({ spacing: { after: 100 } })
          );
        }
      }

      // Tables
      if (sec.table && sec.table.headers.length) {
        const tableRows: TableRow[] = [];

        // Header row
        tableRows.push(
          new TableRow({
            tableHeader: true,
            cantSplit: true,
            children: sec.table.headers.map(th =>
              new TableCell({
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: th, bold: true, color: "FFFFFF", size: 18 })]
                  })
                ],
                shading: { type: ShadingType.CLEAR, fill: "1E293B" }
              })
            )
          })
        );

        // Data rows with alternating shading
        sec.table.rows.forEach((row, ri) => {
          tableRows.push(
            new TableRow({
              cantSplit: true,
              children: row.map(cell =>
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: cell, size: 18 })]
                    })
                  ],
                  shading: { type: ShadingType.CLEAR, fill: ri % 2 === 0 ? "F8FAFC" : "FFFFFF" }
                })
              )
            })
          );
        });

        children.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            margins: { top: 100, bottom: 100, left: 120, right: 120 },
            rows: tableRows
          }),
          new Paragraph({ spacing: { after: 120 } })
        );
      }
    }
  }

  // Final Takeaway
  if (opts.finalTakeaway) {
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        margins: { top: 140, bottom: 140, left: 180, right: 180 },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: "EXECUTIVE SYNTHESIS & FINAL TAKEAWAY", bold: true, color: "FFFFFF", size: 18 })
                    ],
                    spacing: { after: 60 }
                  }),
                  new Paragraph({
                    children: [new TextRun({ text: opts.finalTakeaway, color: "F1F5F9", size: 19 })]
                  })
                ],
                shading: { type: ShadingType.CLEAR, fill: "0F172A" },
                borders: {
                  top: { style: BorderStyle.NONE },
                  left: { style: BorderStyle.NONE },
                  right: { style: BorderStyle.NONE },
                  bottom: { style: BorderStyle.NONE }
                }
              })
            ]
          })
        ]
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              bottom: 1440,
              left: 1440,
              right: 1440
            }
          }
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `GOOGLE ACADEMY COMPANION  •  ${opts.subject.toUpperCase()}  •  ${opts.documentType.toUpperCase()}`,
                    size: 16,
                    color: "94A3B8"
                  })
                ],
                alignment: AlignmentType.RIGHT
              })
            ]
          })
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: "Google Academy Companion  •  Source Grounded Curriculum        Page ", size: 16, color: "94A3B8" }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "94A3B8" }),
                  new TextRun({ text: " of ", size: 16, color: "94A3B8" }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: "94A3B8" })
                ],
                alignment: AlignmentType.CENTER
              })
            ]
          })
        },
        children
      }
    ]
  });

  return await Packer.toBuffer(doc);
}
