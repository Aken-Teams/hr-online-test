# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This repository contains exam/test question banks (試題題庫) for a semiconductor manufacturing joint venture company. The questions are used for employee skill assessments across departments and roles.

## Data Structure

All question bank files are `.xls` (Excel 97-2003) format located in `试题范例/`.

### File Schemas

**判断题题库.xls** (True/False Questions) — 668 rows, sheet: `判断题`
- Columns: 试题描述(文本), 正确(是/否), 试题级别, 所属部门, 人员范围

**问答题题库.xls** (Essay/Short Answer Questions) — 203 rows, sheet: `简答题`
- Columns: 试题描述(文本), 试题级别, 所属部门, 人员范围

**选择题题库.xls** (Multiple Choice Questions) — 90 rows, sheet: `选择`
- Columns: 试题描述(文本), 试题级别, 所属部门, 人员范围, A选项(文本), B选项(文本), C选项(文本), D选项(文本), 可多选(是/否), 正确答案

### Common Field Values

- **试题级别** (Difficulty): 一级题库, etc.
- **所属部门** (Department): 资材部, etc.
- **人员范围** (Role): 仓管员, etc.

## Working with the Files

- Files are `.xls` (not `.xlsx`), so use `xlrd` library in Python to read them. `openpyxl` does not support `.xls`.
- Text content is in Simplified Chinese (简体中文).
- Set `PYTHONIOENCODING=utf-8` when running Python scripts on Windows to avoid cp950 encoding errors.
- This is not a git repository.
