       IDENTIFICATION DIVISION.
       PROGRAM-ID. GAME-OF-LIFE.
       AUTHOR. ALAN SMITHEE.
       
       ENVIRONMENT DIVISION.
       CONFIGURATION SECTION.
       
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 GRID-SIZE            PIC 9(2) VALUE 20.
       01 MAX-GENERATIONS      PIC 9(3) VALUE 100.
       
       01 CURRENT-GRID.
          02 ROW OCCURS 20 TIMES.
             03 CELL OCCURS 20 TIMES PIC 9 VALUE 0.
       
       01 NEXT-GRID.
          02 ROW OCCURS 20 TIMES.
             03 CELL OCCURS 20 TIMES PIC 9 VALUE 0.
       
       01 COUNTERS.
          02 ROW-INDEX         PIC 9(2) VALUE 1.
          02 COL-INDEX         PIC 9(2) VALUE 1.
          02 NEIGHBOR-COUNT    PIC 9 VALUE 0.
          02 GEN-COUNT         PIC 9(3) VALUE 0.
       
       01 NEIGHBOR-COORDS.
          02 ROW-OFFSET        PIC S9 VALUE 0.
          02 COL-OFFSET        PIC S9 VALUE 0.
          02 ROW-CHECK         PIC S9(2) VALUE 0.
          02 COL-CHECK         PIC S9(2) VALUE 0.
       
       01 USER-INPUT           PIC X VALUE SPACE.
       
       PROCEDURE DIVISION.
       MAIN-PARA.
           PERFORM INITIALIZE-GRID
           PERFORM DISPLAY-GENERATION
           PERFORM PROCESS-GENERATIONS UNTIL GEN-COUNT >= MAX-GENERATIONS
               OR USER-INPUT = 'Q'
           STOP RUN.
       
       INITIALIZE-GRID.
      * SET INITIAL PATTERN - GLIDER
           MOVE 1 TO CELL(2, 3)
           MOVE 1 TO CELL(3, 4)
           MOVE 1 TO CELL(4, 2)
           MOVE 1 TO CELL(4, 3)
           MOVE 1 TO CELL(4, 4)
           
      * BLINKER
           MOVE 1 TO CELL(10, 10)
           MOVE 1 TO CELL(10, 11)
           MOVE 1 TO CELL(10, 12).
       
       PROCESS-GENERATIONS.
           ADD 1 TO GEN-COUNT
           PERFORM CALCULATE-NEXT-GENERATION
           PERFORM COPY-NEXT-TO-CURRENT
           PERFORM DISPLAY-GENERATION
           DISPLAY "GENERATION: " GEN-COUNT
           DISPLAY "PRESS ENTER TO CONTINUE OR Q TO QUIT"
           ACCEPT USER-INPUT.
       
       CALCULATE-NEXT-GENERATION.
           PERFORM VARYING ROW-INDEX FROM 1 BY 1 UNTIL ROW-INDEX > GRID-SIZE
               PERFORM VARYING COL-INDEX FROM 1 BY 1 
                   UNTIL COL-INDEX > GRID-SIZE
                   
                   PERFORM COUNT-NEIGHBORS
                   
      * APPLY GAME OF LIFE RULES
                   EVALUATE TRUE
                       WHEN NEIGHBOR-COUNT < 2 AND CELL(ROW-INDEX, COL-INDEX) = 1
                           MOVE 0 TO CELL OF NEXT-GRID(ROW-INDEX, COL-INDEX)
                       WHEN NEIGHBOR-COUNT > 3 AND CELL(ROW-INDEX, COL-INDEX) = 1
                           MOVE 0 TO CELL OF NEXT-GRID(ROW-INDEX, COL-INDEX)
                       WHEN NEIGHBOR-COUNT = 3 AND CELL(ROW-INDEX, COL-INDEX) = 0
                           MOVE 1 TO CELL OF NEXT-GRID(ROW-INDEX, COL-INDEX)
                       WHEN NEIGHBOR-COUNT = 2 OR NEIGHBOR-COUNT = 3
                           MOVE CELL(ROW-INDEX, COL-INDEX) TO 
                               CELL OF NEXT-GRID(ROW-INDEX, COL-INDEX)
                       WHEN OTHER
                           MOVE 0 TO CELL OF NEXT-GRID(ROW-INDEX, COL-INDEX)
                   END-EVALUATE
               END-PERFORM
           END-PERFORM.
       
       COUNT-NEIGHBORS.
           MOVE 0 TO NEIGHBOR-COUNT
           PERFORM VARYING ROW-OFFSET FROM -1 BY 1 UNTIL ROW-OFFSET > 1
               PERFORM VARYING COL-OFFSET FROM -1 BY 1 UNTIL COL-OFFSET > 1
                   IF NOT (ROW-OFFSET = 0 AND COL-OFFSET = 0)
                       COMPUTE ROW-CHECK = ROW-INDEX + ROW-OFFSET
                       COMPUTE COL-CHECK = COL-INDEX + COL-OFFSET
                       
                       IF ROW-CHECK > 0 AND ROW-CHECK <= GRID-SIZE AND
                          COL-CHECK > 0 AND COL-CHECK <= GRID-SIZE
                           IF CELL(ROW-CHECK, COL-CHECK) = 1
                               ADD 1 TO NEIGHBOR-COUNT
                           END-IF
                       END-IF
                   END-IF
               END-PERFORM
           END-PERFORM.
       
       COPY-NEXT-TO-CURRENT.
           PERFORM VARYING ROW-INDEX FROM 1 BY 1 UNTIL ROW-INDEX > GRID-SIZE
               PERFORM VARYING COL-INDEX FROM 1 BY 1 
                   UNTIL COL-INDEX > GRID-SIZE
                   MOVE CELL OF NEXT-GRID(ROW-INDEX, COL-INDEX) TO
                       CELL(ROW-INDEX, COL-INDEX)
               END-PERFORM
           END-PERFORM.
       
       DISPLAY-GENERATION.
           DISPLAY SPACE
           PERFORM VARYING ROW-INDEX FROM 1 BY 1 UNTIL ROW-INDEX > GRID-SIZE
               PERFORM VARYING COL-INDEX FROM 1 BY 1 
                   UNTIL COL-INDEX > GRID-SIZE
                   IF CELL(ROW-INDEX, COL-INDEX) = 1
                       DISPLAY "*" WITH NO ADVANCING
                   ELSE
                       DISPLAY " " WITH NO ADVANCING
                   END-IF
               END-PERFORM
               DISPLAY SPACE
           END-PERFORM.
