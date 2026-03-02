# KASTRA POS User Manual

This directory contains the complete enterprise-level user manual for KASTRA POS System.

## Files

- `USER_MANUAL.md` - Part 1: Introduction, Requirements, Installation, Setup
- `USER_MANUAL_PART2.md` - Part 2: User Roles, POS Operations, Inventory
- `USER_MANUAL_PART3.md` - Part 3: Hospitality, Reports, eTIMS, Troubleshooting
- `USER_MANUAL_PART4.md` - Part 4: Appendix, Glossary, Quick Reference
- `generate-manual-pdf.sh` - Script to generate PDF from markdown files

## Generating PDF

### Option 1: Using the Script (Recommended)

```bash
# Make script executable (if not already)
chmod +x generate-manual-pdf.sh

# Run the script
./generate-manual-pdf.sh
```

The script will:
1. Check if Pandoc is installed
2. Combine all manual parts
3. Generate a professional PDF with table of contents
4. Show statistics (file size, page count)

### Option 2: Manual Generation

#### Install Pandoc

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install pandoc texlive-latex-base texlive-fonts-recommended texlive-latex-extra
```

**macOS:**
```bash
brew install pandoc
brew install --cask basictex
```

**Windows:**
Download from https://pandoc.org/installing.html

#### Combine Files

```bash
cat USER_MANUAL.md USER_MANUAL_PART2.md USER_MANUAL_PART3.md USER_MANUAL_PART4.md > COMPLETE_MANUAL.md
```

#### Generate PDF

```bash
pandoc COMPLETE_MANUAL.md -o KASTRA_POS_Manual.pdf \
  --pdf-engine=xelatex \
  --toc \
  --toc-depth=3 \
  --number-sections \
  -V geometry:margin=1in \
  -V fontsize=11pt \
  -V documentclass=report
```

### Option 3: Using Microsoft Word

1. Open Microsoft Word
2. File → Open → Select `USER_MANUAL.md`
3. Repeat for all parts (PART2, PART3, PART4)
4. Combine documents (Insert → Object → Text from File)
5. Add table of contents (References → Table of Contents)
6. Add page numbers (Insert → Page Number)
7. File → Save As → PDF

### Option 4: Using Google Docs

1. Go to Google Docs
2. File → Open → Upload markdown files
3. Combine documents
4. Format as needed
5. File → Download → PDF Document

### Option 5: Online Converters

**Recommended:**
- https://www.markdowntopdf.com/
- https://dillinger.io/
- https://md2pdf.netlify.app/

**Steps:**
1. Combine all markdown files into one
2. Copy content
3. Paste into online converter
4. Download PDF

## Adding Screenshots

To add screenshots to the manual:

1. Create images directory:
```bash
mkdir -p docs/images
```

2. Add your screenshots to `docs/images/`

3. Reference in markdown:
```markdown
![Description](./docs/images/screenshot.png)
```

4. Generate PDF with images:
```bash
pandoc COMPLETE_MANUAL.md -o Manual.pdf --resource-path=./docs/images
```

## Manual Contents

### Part 1: Foundation
- Introduction to KASTRA POS
- System requirements
- Installation guide (Ubuntu server)
- Initial setup wizard
- First-time configuration

### Part 2: Operations
- User roles and permissions
- Point of Sale operations
- Inventory management
- Purchase orders and suppliers

### Part 3: Advanced Features
- Hospitality features (restaurant mode)
- Reports and analytics (20+ report types)
- KRA eTIMS integration
- Troubleshooting guide

### Part 4: Reference
- Keyboard shortcuts
- Glossary of terms
- API endpoints
- Security best practices
- Compliance checklist
- Quick reference card

## Document Statistics

- **Total Pages**: ~80-100 pages (when converted to PDF)
- **Word Count**: ~25,000 words
- **Sections**: 13 major sections
- **Subsections**: 100+ subsections
- **Code Examples**: 50+ code blocks
- **Tables**: 30+ reference tables

## Customization

To customize the manual for your business:

1. **Replace Business Name:**
```bash
sed -i 's/yourbusiness.co.ke/yourcompany.com/g' *.md
```

2. **Update Contact Information:**
Edit the contact details in Part 4 (Appendix section)

3. **Add Your Logo:**
Add logo image and reference in cover page:
```markdown
![Company Logo](./docs/images/logo.png)
```

4. **Customize Branding:**
Edit the metadata in `generate-manual-pdf.sh`:
```bash
--metadata author="Your Company Name"
```

## Troubleshooting PDF Generation

### Error: "pandoc: command not found"
**Solution:** Install Pandoc (see installation instructions above)

### Error: "xelatex not found"
**Solution:** Install LaTeX:
```bash
# Ubuntu
sudo apt install texlive-xetex

# macOS
brew install --cask mactex
```

### Error: "PDF generation failed"
**Solution:** Try alternative PDF engine:
```bash
pandoc COMPLETE_MANUAL.md -o Manual.pdf --pdf-engine=pdflatex
```

### Error: "Out of memory"
**Solution:** Generate in parts or use online converter

### PDF has no table of contents
**Solution:** Ensure `--toc` flag is included in pandoc command

### Images not showing in PDF
**Solution:** Use `--resource-path` flag and check image paths

## Support

For questions about the manual or PDF generation:

- **Email:** support@kastrapos.co.ke
- **Documentation:** https://docs.kastrapos.co.ke
- **GitHub Issues:** https://github.com/yourusername/kastra-pos/issues

## License

Copyright © 2026 KASTRA Technologies. All rights reserved.

This manual is proprietary and confidential. Distribution requires written permission.

---

**Last Updated:** March 2026  
**Version:** 1.0  
**Maintained By:** KASTRA Technologies
