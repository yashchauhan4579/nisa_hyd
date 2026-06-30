import { jsPDF } from 'jspdf'

/**
 * Generate a Section 65B(4) certificate PDF for electronic evidence.
 *
 * @param {Object} params
 * @param {string} params.caseRef       – Case/FIR reference number
 * @param {string} params.deviceName    – Name of the MagicBox device
 * @param {string} params.deviceIp      – IP address of the device
 * @param {string} params.cameraName    – Camera name/channel
 * @param {string} params.cameraBrand   – NVR brand (Hikvision, Dahua, etc.)
 * @param {string} params.startTime     – Recording start time (ISO or display string)
 * @param {string} params.endTime       – Recording end time
 * @param {string} params.fileName      – Name of the exported recording file
 * @param {string} params.fileHash      – SHA-256 hash of the file (optional)
 * @param {string} params.signatoryName – Name of the person issuing the certificate
 * @param {string} params.signatoryRole – Designation/role
 * @param {string} params.signatoryOrg  – Organisation name
 * @param {string} params.remarks       – Any additional remarks (optional)
 */
export default function generate65BCertificate(params) {
  const {
    caseRef = '',
    deviceName = '',
    deviceIp = '',
    cameraName = '',
    cameraBrand = '',
    startTime = '',
    endTime = '',
    fileName = '',
    fileHash = '',
    signatoryName = '',
    signatoryRole = '',
    signatoryOrg = '',
    policeStation = '',
    division = '',
    remarks = '',
  } = params

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 20
  const contentWidth = pageWidth - margin * 2
  let y = 20

  // ── Helpers ──
  const center = (text, size, style = 'bold') => {
    doc.setFontSize(size)
    doc.setFont('helvetica', style)
    const tw = doc.getTextWidth(text)
    doc.text(text, (pageWidth - tw) / 2, y)
    y += size * 0.45
  }

  const labelCol = 60 // fixed indent for values (mm from left edge)

  const label = (lbl, val) => {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(lbl, margin, y)
    doc.setFont('helvetica', 'normal')
    const valX = margin + labelCol
    const lines = doc.splitTextToSize(String(val || 'N/A'), contentWidth - labelCol)
    doc.text(lines, valX, y)
    y += lines.length * 5 + 2
  }

  const pageBottom = doc.internal.pageSize.getHeight() - 22 // leave room for footer

  const checkPage = (neededMm = 20) => {
    if (y + neededMm > pageBottom) {
      doc.addPage()
      y = 20
    }
  }

  const para = (text, size = 10) => {
    doc.setFontSize(size)
    doc.setFont('helvetica', 'normal')
    const lines = doc.splitTextToSize(text, contentWidth)
    const blockH = lines.length * (size * 0.42) + 4
    checkPage(blockH)
    doc.text(lines, margin, y)
    y += blockH
  }

  const hr = () => {
    doc.setDrawColor(180)
    doc.setLineWidth(0.3)
    doc.line(margin, y, pageWidth - margin, y)
    y += 4
  }

  const now = new Date()
  const certDate = now.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
  const certTime = now.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  })
  const certNo = `MBX-65B-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`

  // ── Header ──
  center('CERTIFICATE', 16)
  y += 1
  center('Under Section 65B(4) of the Indian Evidence Act, 1872', 11, 'normal')
  center('(Read with Section 63 of the Bhartiya Sakshya Adhiniyam, 2023)', 9, 'italic')
  y += 4
  hr()

  // ── Certificate metadata ──
  label('Certificate No:', certNo)
  label('Date of Issue:', `${certDate}, ${certTime}`)
  if (caseRef) label('Case / FIR Ref:', caseRef)
  y += 2
  hr()

  // ── Section 1: Device details ──
  y += 2
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('1. PARTICULARS OF THE ELECTRONIC DEVICE', margin, y)
  y += 7

  label('Device Name:', deviceName)
  label('Device IP Address:', deviceIp)
  label('Camera / Channel:', cameraName)
  label('NVR Brand / Type:', cameraBrand)
  label('System:', 'MagicBox USS — Unified Surveillance System')
  y += 2

  // ── Section 2: Recording details ──
  checkPage(40)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('2. PARTICULARS OF THE ELECTRONIC RECORD', margin, y)
  y += 7

  label('Recording Start:', formatTime(startTime))
  label('Recording End:', formatTime(endTime))
  label('Exported File Name:', fileName)
  if (fileHash) label('File Hash (SHA-256):', fileHash)
  label('Export Date & Time:', `${certDate}, ${certTime}`)
  y += 2

  // ── Section 3: Certification statement ──
  checkPage(30)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('3. CERTIFICATION STATEMENT', margin, y)
  y += 7

  para(
    'I, the undersigned, being a person occupying a responsible official position in relation to the operation of the relevant device and/or management of the relevant activities, do hereby certify the following:'
  )

  const statements = [
    '(a) The electronic record described above is a faithful and accurate reproduction of the information contained in the computer/electronic device identified in Section 1. The video footage was retrieved via the MagicBox USS (Universal Surveillance System), a secure video integration gateway operated by WiredLeap AI on behalf of the Bengaluru City Police.',
    '(b) The said electronic record was produced by the computer/device during the period in which the computer/device was used regularly to store or process information for the purposes of the activities regularly carried on over that period by the person having lawful control over the use of the computer/device. The NVR/DVR at the Client premises continuously records video from approved public-facing cameras in the ordinary course of surveillance operations.',
    '(c) During the said period, information of the kind contained in the electronic record was regularly fed into the computer/device in the ordinary course of the said activities. Video feeds from CCTV cameras are continuously streamed to the NVR/DVR and recorded as part of the regular surveillance operations under the authorization of the location owner.',
    '(d) Throughout the material part of the said period, the computer/device was operating properly, or if not, any deficiency in its operation was not such as to affect the electronic record or the accuracy of its contents. The MagicBox USS device was connected to the NVR/DVR via a secure encrypted VPN tunnel (WireGuard), and the system was monitored for uptime and connectivity.',
    '(e) The information contained in the electronic record reproduces or is derived from information fed into the computer/device in the ordinary course of the said activities.',
    '(f) The Technology Provider (WiredLeap AI) does not record or store any video feeds on its own servers. All historical video footage remains stored on the Client\'s local NVR/DVR device. The MagicBox Hub acts solely as a remote access portal to retrieve and stream recordings from the Client\'s equipment.',
    '(g) As per the deployment protocol, only cameras with a clear view of public areas are configured for access. Cameras monitoring private interiors are strictly prohibited from being provisioned in the system. The camera provisioning is jointly verified by the installation technician and the location owner before any access is configured.',
  ]

  statements.forEach(s => {
    para(s, 9.5)
  })

  y += 2

  // ── Section 4: Remarks ──
  if (remarks) {
    checkPage(25)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('4. REMARKS', margin, y)
    y += 7
    para(remarks)
    y += 2
  }

  hr()
  y += 4

  // ── Signatory ──
  checkPage(70)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(remarks ? '5. SIGNATORY' : '4. SIGNATORY', margin, y)
  y += 10

  label('Name:', signatoryName)
  label('Designation:', signatoryRole)
  label('Police Station:', policeStation)
  label('Division:', division)
  label('Organisation:', signatoryOrg)
  y += 12

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Signature: ______________________________', margin, y)
  y += 8
  doc.text('Date: ______________________________', margin, y)
  y += 8
  doc.text('Place: ______________________________', margin, y)

  // ── Footer (on every page) ──
  const totalPages = doc.internal.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    const footerY = doc.internal.pageSize.getHeight() - 10
    doc.setDrawColor(180)
    doc.setLineWidth(0.2)
    doc.line(margin, footerY - 6, pageWidth - margin, footerY - 6)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(120)
    doc.text(
      'This certificate is generated by MagicBox USS (Unified Surveillance System). It is the responsibility of the signatory to verify accuracy before submission.',
      margin, footerY - 2
    )
    doc.text(`Certificate No: ${certNo}  |  Page ${p} of ${totalPages}`, margin, footerY + 2)
  }

  // ── Save / Return ──
  const safeName = (deviceName || 'device').replace(/[^a-zA-Z0-9_\-]/g, '_').toLowerCase()
  const dateStr = now.toISOString().slice(0, 10)
  const filename = `65B_Certificate_${safeName}_${dateStr}.pdf`

  // In browser: trigger download. In Node: return doc for manual output.
  if (typeof window !== 'undefined') {
    doc.save(filename)
  }

  return { doc, filename }
}

function formatTime(t) {
  if (!t) return 'N/A'
  try {
    const d = new Date(t)
    if (isNaN(d.getTime())) return t
    return d.toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
    })
  } catch {
    return t
  }
}
