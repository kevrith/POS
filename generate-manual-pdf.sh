#!/bin/bash

# KASTRA POS User Manual - PDF Generation Script
# This script combines all manual parts and generates a professional PDF

echo "🔧 KASTRA POS User Manual - PDF Generator"
echo "=========================================="
echo ""

# Check if pandoc is installed
if ! command -v pandoc &> /dev/null; then
    echo "❌ Pandoc is not installed!"
    echo ""
    echo "Install Pandoc:"
    echo "  Ubuntu/Debian: sudo apt install pandoc texlive-latex-base texlive-fonts-recommended"
    echo "  macOS: brew install pandoc basictex"
    echo "  Windows: Download from https://pandoc.org/installing.html"
    echo ""
    exit 1
fi

echo "✅ Pandoc found: $(pandoc --version | head -1)"
echo ""

# Combine all manual parts and strip all Unicode emojis/symbols
echo "📄 Combining manual parts..."
cat USER_MANUAL.md USER_MANUAL_PART2.md USER_MANUAL_PART3.md USER_MANUAL_PART4.md | \
    LC_ALL=C sed 's/[^[:print:]\t\n]//g' | \
    sed 's/\[\]//g' > KASTRA_POS_COMPLETE_MANUAL.md

if [ $? -eq 0 ]; then
    echo "✅ Manual parts combined successfully"
else
    echo "❌ Failed to combine manual parts"
    exit 1
fi

# Check for LaTeX
if ! command -v pdflatex &> /dev/null; then
    echo "⚠️  LaTeX not found. Installing texlive packages..."
    echo "📦 This may take a few minutes..."
    sudo apt-get update && sudo apt-get install -y texlive-latex-base texlive-fonts-recommended texlive-latex-extra
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install LaTeX"
        echo "Please run: sudo apt-get install texlive-latex-base texlive-fonts-recommended"
        exit 1
    fi
fi

# Generate PDF
echo ""
echo "📑 Generating PDF..."
pandoc KASTRA_POS_COMPLETE_MANUAL.md \
    -o KASTRA_POS_User_Manual.pdf \
    --pdf-engine=pdflatex \
    --toc \
    --toc-depth=3 \
    --number-sections \
    -V geometry:margin=1in \
    -V fontsize=11pt \
    -V documentclass=report \
    -V papersize=a4 \
    -V colorlinks=true \
    -V linkcolor=blue \
    -V urlcolor=blue \
    -V toccolor=black \
    --highlight-style=tango \
    --metadata title="KASTRA POS System" \
    --metadata subtitle="Enterprise User Manual & Installation Guide" \
    --metadata author="KASTRA Technologies" \
    --metadata date="March 2026" \
    --metadata version="1.0"

if [ $? -eq 0 ]; then
    echo "✅ PDF generated successfully!"
    echo ""
    echo "📦 Output files:"
    echo "  - KASTRA_POS_COMPLETE_MANUAL.md (Combined markdown)"
    echo "  - KASTRA_POS_User_Manual.pdf (Final PDF)"
    echo ""
    
    # Get file size
    if [ -f "KASTRA_POS_User_Manual.pdf" ]; then
        SIZE=$(du -h "KASTRA_POS_User_Manual.pdf" | cut -f1)
        PAGES=$(pdfinfo "KASTRA_POS_User_Manual.pdf" 2>/dev/null | grep "Pages:" | awk '{print $2}')
        echo "📊 PDF Statistics:"
        echo "  - Size: $SIZE"
        if [ ! -z "$PAGES" ]; then
            echo "  - Pages: $PAGES"
        fi
    fi
    
    echo ""
    echo "✨ Done! Your manual is ready."
else
    echo "❌ Failed to generate PDF"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Ensure LaTeX is installed (texlive-latex-base)"
    echo "  2. Try: pandoc --pdf-engine=pdflatex instead of xelatex"
    echo "  3. Check for syntax errors in markdown files"
    exit 1
fi
