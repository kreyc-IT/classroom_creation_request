#!/usr/bin/env python3
"""Create an upload-ready NotebookLM PDF from sanitized portal screenshots."""

from __future__ import annotations

from pathlib import Path
import shutil

from PIL import Image
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
SCREEN_ROOT = ROOT / "tmp" / "visual_screenshots"
OUTPUT_ROOT = ROOT / "output" / "pdf"
PNG_OUTPUT_ROOT = ROOT / "output" / "notebooklm_visuals"
OUTPUT_PDF = OUTPUT_ROOT / "NotebookLM_Classroom_Request_Visual_Walkthrough.pdf"
CONTACT_SHEET = SCREEN_ROOT / "contact_sheet.png"

PURPLE = HexColor("#6161FF")
PURPLE_DARK = HexColor("#3F3FBF")
PURPLE_LIGHT = HexColor("#EEEEFF")
INK = HexColor("#292F3D")
MUTED = HexColor("#676879")
LINE = HexColor("#D0D4E4")
BG = HexColor("#F6F7FB")


SCREENS = [
    {
        "file": "01_welcome.png",
        "audience": "COACH",
        "title": "1. Acknowledge the request expectations",
        "caption": "The coach begins by accepting the 3-5 lesson limit and the 2-5 business-day processing timeline.",
        "highlights": ["One request covers one class.", "Continue is available after acknowledgement."],
    },
    {
        "file": "02_select_class.png",
        "audience": "COACH",
        "title": "2. Select the active school and class",
        "caption": "The directory shows an explicit loading state, supports search and pagination, and displays the current teacher with the class.",
        "highlights": ["Only eligible classes from active schools appear.", "A class with no assigned teacher can still be selected."],
    },
    {
        "file": "03_request_details.png",
        "audience": "COACH",
        "title": "3. Confirm the coach and class-specific details",
        "caption": "The coach assignment is offered automatically when the current teacher has a suitable Staff Directory coach.",
        "highlights": ["Manual contact remains available when needed.", "Grade level and Classrooms Needed By are optional class details."],
    },
    {
        "file": "04_platform_details.png",
        "audience": "COACH",
        "title": "4. Provide LMS and grading information safely",
        "caption": "The request stores class-specific platform information while reminding the coach to use secure-share links instead of reusable passwords.",
        "highlights": ["LMS verification is optional; other grading platform is used when Google Classroom grading is No.", "Credential contents are not shown in the progress summary."],
    },
    {
        "file": "05_review_submit.png",
        "audience": "COACH",
        "title": "5. Review, save, submit, or add another class",
        "caption": "The Review step separates draft saving from Tech notification and makes the multi-class behavior explicit.",
        "highlights": ["Save as draft does not notify Tech.", "Submit and add another class creates a separate request parent item."],
    },
    {
        "file": "06_draft_saved.png",
        "audience": "COACH",
        "title": "6. Return through the persistent class link",
        "caption": "A saved draft remains tied to the class. The Accounts class-row link is the reliable way to reopen it.",
        "highlights": ["The private coach link permits editing.", "Keep the coach link confidential."],
    },
    {
        "file": "07_coach_progress.png",
        "audience": "COACH",
        "title": "7. View progress and send follow-up information",
        "caption": "After submission, the coach sees the class status, public progress, target date, and options to edit details or send a message to Tech.",
        "highlights": ["Updates stay on the same request item.", "Add another class begins a separate class request."],
    },
    {
        "file": "08_teacher_progress.png",
        "audience": "TEACHER",
        "title": "8. Teacher access is read-only",
        "caption": "When Tech includes the teacher, the teacher receives a safe progress view without coach editing controls.",
        "highlights": ["The request follows the class if the teacher changes.", "The teacher can refresh status but cannot edit the request."],
    },
    {
        "file": "09_tech_board.png",
        "audience": "TECH",
        "title": "9. Tech manages progress on the same request item",
        "caption": "Tech updates the public status and target date, keeps internal notes private, and queues notifications for the coach or coach and teacher.",
        "highlights": ["Assigned Techs is a separate multi-person assignment field.", "Notification State sends progress updates to Coach or Coach + Teacher."],
    },
    {
        "file": "10_audit_log.png",
        "audience": "TECH",
        "title": "10. Use Activity Log and sanitized JSON audit history",
        "caption": "The native monday.com Activity Log records item changes, while the Google Sheet provides system-wide events and sanitized snapshots.",
        "highlights": ["The Tech Assignment Queue persists debounce and delivery state.", "Sensitive values and access tokens are redacted."],
    },
    {
        "file": "11_tech_assignment.png",
        "audience": "TECH",
        "title": "11. Assign one or several technicians",
        "caption": "The single Assigned Techs People column supports multiple technicians while limiting notifications to individual members of Tech Team 881594.",
        "highlights": ["The one-minute worker detects changes.", "Five quiet minutes consolidate rapid assignment edits."],
    },
    {
        "file": "12_assignment_notifications.png",
        "audience": "TECH",
        "title": "12. Deliver readable assignment notifications",
        "caption": "Each newly assigned technician receives a first-name branded email, and the Tech space receives one logo-free consolidated Google Chat card.",
        "highlights": ["Retained assignees are not emailed again.", "Email pause holds email but does not suppress Chat."],
    },
]


def wrap_text(text: str, font: str, size: float, max_width: float):
    words = text.split()
    lines = []
    current = ""
    for word in words:
        candidate = word if not current else current + " " + word
        if stringWidth(candidate, font, size) <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def crop_screenshot(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGB")
    width, height = image.size
    target_width = min(width, 720)
    left = 0
    right = min(width, left + target_width)

    pixels = image.load()
    bg = (246, 247, 251)
    last_content = min(height - 1, 700)
    for y in range(height):
        different = 0
        for x in range(left, right, 6):
            r, g, b = pixels[x, y]
            if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) > 28:
                different += 1
        if different >= 10:
            last_content = y
    bottom = min(height, last_content + 32)
    bottom = max(bottom, min(height, 500))
    return image.crop((left, 0, right, bottom))


def build_contact_sheet():
    thumbnails = []
    for spec in SCREENS:
        image = crop_screenshot(SCREEN_ROOT / spec["file"])
        image.thumbnail((440, 300), Image.Resampling.LANCZOS)
        thumbnails.append((spec["title"], image.copy()))

    sheet = Image.new("RGB", (960, 2060), "#F6F7FB")
    from PIL import ImageDraw
    draw = ImageDraw.Draw(sheet)
    for index, (title, thumb) in enumerate(thumbnails):
        col = index % 2
        row = index // 2
        x = 25 + col * 470
        y = 25 + row * 335
        draw.rounded_rectangle((x, y, x + 440, y + 310), radius=12, fill="white", outline="#D0D4E4", width=2)
        draw.text((x + 12, y + 10), title, fill="#292F3D")
        sheet.paste(thumb, (x + 12, y + 38))
    sheet.save(CONTACT_SHEET)


def draw_footer(pdf: canvas.Canvas, page_number: int):
    pdf.setStrokeColor(LINE)
    pdf.setLineWidth(0.5)
    pdf.line(36, 24, 756, 24)
    pdf.setFont("Helvetica", 7.5)
    pdf.setFillColor(MUTED)
    pdf.drawString(36, 12, "Kreyco Tech Support - Sanitized NotebookLM visual source")
    pdf.drawRightString(756, 12, f"Page {page_number}")


def draw_cover(pdf: canvas.Canvas):
    width, height = landscape(letter)
    pdf.setFillColor(BG)
    pdf.rect(0, 0, width, height, fill=1, stroke=0)
    pdf.setFillColor(PURPLE)
    pdf.rect(0, height - 10, width, 10, fill=1, stroke=0)
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawCentredString(width / 2, height - 95, "NOTEBOOKLM VISUAL SOURCE PACK")
    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 28)
    pdf.drawCentredString(width / 2, height - 145, "Classroom Creation Request")
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 16)
    pdf.drawCentredString(width / 2, height - 176, "Coach, teacher, and Tech visual walkthrough")

    x, y, w, h = 112, 210, 568, 150
    pdf.setFillColor(white)
    pdf.setStrokeColor(LINE)
    pdf.roundRect(x, y, w, h, 10, fill=1, stroke=1)
    pdf.setFillColor(PURPLE_DARK)
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(x + 22, y + h - 30, "How to use this source")
    notes = [
        "Upload this PDF to the same NotebookLM notebook as the system handbook.",
        "Ask the Video Overview to use these screens when explaining each workflow stage.",
        "All names, item IDs, dates, and activity records in this pack are fictitious and sanitized.",
        "No passwords, credential contents, API tokens, signing secrets, or live access links are included.",
    ]
    cursor = y + h - 55
    pdf.setFont("Helvetica", 10)
    pdf.setFillColor(INK)
    for note in notes:
        pdf.setFillColor(PURPLE)
        pdf.circle(x + 26, cursor + 3, 2.2, fill=1, stroke=0)
        pdf.setFillColor(INK)
        pdf.drawString(x + 38, cursor, note)
        cursor -= 23
    pdf.setFont("Helvetica", 8)
    pdf.setFillColor(MUTED)
    pdf.drawCentredString(width / 2, 78, "Visual state date: September 3, 2026 - Production-style fixture based on the current portal interface")
    draw_footer(pdf, 1)
    pdf.showPage()


def draw_screen_page(pdf: canvas.Canvas, spec: dict, page_number: int):
    width, height = landscape(letter)
    pdf.setFillColor(white)
    pdf.rect(0, 0, width, height, fill=1, stroke=0)
    pdf.setFillColor(PURPLE)
    pdf.rect(0, height - 8, width, 8, fill=1, stroke=0)

    pdf.setFillColor(PURPLE)
    pdf.roundRect(36, height - 43, 72, 18, 9, fill=1, stroke=0)
    pdf.setFillColor(white)
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawCentredString(72, height - 37, spec["audience"])

    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 17)
    pdf.drawString(122, height - 41, spec["title"])

    caption_lines = wrap_text(spec["caption"], "Helvetica", 9.5, 720)
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 9.5)
    caption_y = height - 64
    for line in caption_lines[:2]:
        pdf.drawString(36, caption_y, line)
        caption_y -= 13

    image = crop_screenshot(SCREEN_ROOT / spec["file"])
    image_w, image_h = image.size
    image_area_x, image_area_y = 36, 86
    image_area_w, image_area_h = 720, 410
    scale = min(image_area_w / image_w, image_area_h / image_h)
    draw_w, draw_h = image_w * scale, image_h * scale
    draw_x = image_area_x + (image_area_w - draw_w) / 2
    draw_y = image_area_y + (image_area_h - draw_h) / 2
    pdf.setFillColor(BG)
    pdf.setStrokeColor(LINE)
    pdf.roundRect(image_area_x, image_area_y, image_area_w, image_area_h, 8, fill=1, stroke=1)
    pdf.drawImage(ImageReader(image), draw_x, draw_y, draw_w, draw_h, preserveAspectRatio=True, mask="auto")

    highlight_y = 54
    pdf.setFont("Helvetica", 8.5)
    for index, highlight in enumerate(spec["highlights"]):
        x = 36 + index * 360
        pdf.setFillColor(PURPLE)
        pdf.circle(x + 3, highlight_y + 3, 2.2, fill=1, stroke=0)
        pdf.setFillColor(INK)
        for line_idx, line in enumerate(wrap_text(highlight, "Helvetica", 8.5, 330)[:2]):
            pdf.drawString(x + 12, highlight_y - line_idx * 10, line)

    draw_footer(pdf, page_number)
    pdf.showPage()


def main():
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    PNG_OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)

    build_contact_sheet()

    for source in sorted(SCREEN_ROOT.glob("[0-9][0-9]_*.png")):
        shutil.copy2(source, PNG_OUTPUT_ROOT / source.name)
    contact = SCREEN_ROOT / "contact_sheet.png"
    if contact.exists():
        shutil.copy2(contact, PNG_OUTPUT_ROOT / "00_contact_sheet.png")

    pdf = canvas.Canvas(str(OUTPUT_PDF), pagesize=landscape(letter), pageCompression=1)
    pdf.setTitle("Classroom Creation Request - NotebookLM Visual Walkthrough")
    pdf.setAuthor("Kreyco Tech Support")
    pdf.setSubject("Sanitized coach, teacher, and Tech screenshots for NotebookLM Video Overview")
    draw_cover(pdf)
    for index, spec in enumerate(SCREENS, start=2):
        draw_screen_page(pdf, spec, index)
    pdf.save()
    print(OUTPUT_PDF)


if __name__ == "__main__":
    main()
