import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { useSync } from '../hooks/useSync'
import { supabase } from '../lib/supabase'
import { setTaskStatus, getStatusBadgeClass, getPriorityClass, getUnreadCommentCount } from '../lib/api'
import NotificationBell from '../components/NotificationBell'
import UserProfileTab from '../components/UserProfileTab'
import ChatModal from '../components/ChatModal'
import FileThumb from '../components/FileThumb'
import Lightbox from '../components/Lightbox'
import TaskTimeline from '../components/TaskTimeline'
import DeadlineProgress from '../components/DeadlineProgress'

export default function DashboardPage() {
  const session    = useStore(s => s.session)
  const globalData = useStore(s => s.globalData)
  const { sync }   = useSync()
  const navigate = useNavigate()

  const [chat,         setChat]         = useState(null)
  const [lightboxFile, setLightboxFile] = useState(null)
  const [filterSearch, setFilterSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('All')
  const [presence,     setPresence]     = useState(session?.Status || 'Available')
  const [loadingTask,  setLoadingTask]  = useState(null)
  const [tab,          setTab]          = useState('my-tasks')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [globalPrintPreview, setGlobalPrintPreview] = useState(null)



  // Sync presence state with session status (H11 fix for refresh persistence)
  useEffect(() => {
    if (session?.Status) setPresence(session.Status)
  }, [session?.Status])

  const myTasks = globalData.tasks
    .filter(t => String(t.EmployeeID) === String(session?.ID) && String(t.Archived).toUpperCase() !== 'TRUE')
    .slice().reverse()

  const filteredMyTasks = myTasks.filter(t => {
    if (filterStatus !== 'All' && t.Status !== filterStatus) return false
    if (filterSearch) {
      const q = filterSearch.toLowerCase()
      if (!t.Title?.toLowerCase().includes(q)) return false
    }
    return true
  })

  async function handleStatusUpdate(taskId, status) {
    setLoadingTask(taskId)
    try { await setTaskStatus(taskId, status, session?.Name || '', session?.ID); await sync() }
    finally { setLoadingTask(null) }
  }

  function handleGlobalPrintPreview(task) {
    setGlobalPrintPreview(task)
  }

  function handleConfirmGlobalPrint() {
    if (!globalPrintPreview) return
    
    const { hasUrgent, hasPriority, hasConfidential, checkboxStates, approvalStates, allPurposes } = parseCheckboxesFromTask(globalPrintPreview)
    
    // Clean remarks - remove Purpose and Action lines as they're shown in checkboxes
    const cleanRemarks = (text) => {
      if (!text) return 'Please acknowledge the receipt of this document. Thanks.'
      return text
        .replace(/^Purpose:[\s\S]*?(?=Action:|Remarks:|$)/mi, '')
        .replace(/^Action:.*$/gmi, '')
        .replace(/^From:.*$/gmi, '')
        .replace(/\n\n+/g, '\n')
        .trim() || 'Please acknowledge the receipt of this document. Thanks.'
    }
    const remarksText = cleanRemarks(globalPrintPreview.Description || globalPrintPreview.Instructions)
    
    // All possible action checkboxes from CreateTaskForm
    const allActionOptions = [
      'For compliance',
      'For appropriate action',
      'For information',
      'Please review/comment',
      'Please draft reply',
      'Please monitor/follow up',
      'Please handle',
      'Please attend',
      'Please see me',
      'Please disseminate/circulate',
      'Please return/forward to:',
      'Please schedule',
      'Please file',
    ]
    
    // Generate action checkboxes - show all options, check the selected ones
    const actionCheckboxesHtml = allActionOptions.map(option => {
      const isChecked = allPurposes.includes(option)
      return `<div class="action-item"><div class="checkbox ${isChecked ? 'checked' : ''}"></div><span>${option}</span></div>`
    }).join('')
    
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Action/Routing Slip - ${globalPrintPreview.TaskID}</title>
        <style>
          body { font-family: Cambria, 'Times New Roman', serif; padding: 30px; line-height: 1.4; font-size: 12pt; background: #fff; }
          .page-wrapper { width: 160mm; margin: 15mm 15mm; border: 1px solid #ccc; padding: 15mm; box-shadow: 0 0 10px rgba(0,0,0,0.1); background: #fff; }
          .container { max-width: 100%; border: 2px solid #000; padding: 25px; }
          .header { display: flex; align-items: center; gap: 15px; padding-bottom: 15px; margin-bottom: 20px; }
          .logo-placeholder { width: 80px; height: 80px; border: 1px dashed #999; display: flex; align-items: center; justify-content: center; flex-shrink-0; background: #f9f9f9; }
          .logo-placeholder img { max-width: 100%; max-height: 100%; object-fit: contain; }
          .logo-text { font-size: 8pt; color: #999; text-align: center; }
          .header-content { flex: 1; text-align: left; }
          .agency-name { font-size: 11pt; margin-bottom: 5px; }
          .agency-name .bold { font-weight: bold; }
          .title { font-size: 11pt; font-weight: bold; text-transform: uppercase; text-align: center; }
          .field-row { display: flex; flex-direction: column; gap: 10px; margin-bottom: 15px; }
          .field { display: flex; align-items: center; border-bottom: 1px solid #000; padding: 5px 0; }
          .field-label { font-weight: bold; min-width: 100px; font-size: 10pt; }
          .field-value { flex: 1; padding-left: 10px; }
          .checkboxes { display: flex; gap: 40px; margin: 20px 0; padding: 10px 0; border-bottom: 1px solid #000; }
          .checkbox-item { display: flex; align-items: center; gap: 8px; }
          .checkbox { width: 18px; height: 18px; border: 2px solid #000; }
          .checkbox.checked { background: #000; }
          .checkbox.checked::after { content: '✓'; color: white; font-size: 14px; display: flex; align-items: center; justify-content: center; }
          .section { margin: 20px 0; padding: 15px; border: 1px solid #000; }
          .section-title { font-weight: bold; margin-bottom: 10px; text-transform: uppercase; font-size: 11pt; }
          .actions-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
          .action-item { display: flex; align-items: center; gap: 8px; }
          .approval-section { display: flex; gap: 40px; margin-top: 15px; }
          .approval-item { display: flex; align-items: center; gap: 8px; }
          .remarks-box { min-height: 100px; padding: 10px; margin-top: 10px; border: 1px solid #000; white-space: pre-wrap; }
          .signature-section { margin-top: 40px; text-align: center; }
          .signature-line { border-bottom: 2px solid #000; width: 300px; margin: 40px auto 10px auto; }
          .signature-label { font-size: 10pt; font-weight: bold; }
          @media print { body { padding: 0; } .container { border: none; } }
          @media screen and (max-width: 640px) {
            .page-wrapper { width: 100%; margin: 0; padding: 8px; transform: scale(0.45); transform-origin: top center; }
            .container { padding: 12px; }
            .header { flex-direction: column; gap: 8px; }
            .header-content { text-align: center; }
            .checkboxes { flex-wrap: wrap; gap: 15px; }
            .actions-grid { grid-template-columns: 1fr; }
            .approval-section { flex-wrap: wrap; gap: 15px; }
            .signature-line { width: 200px; }
          }
          @media screen and (min-width: 641px) and (max-width: 768px) {
            .page-wrapper { width: 100%; margin: 0; transform: scale(0.65); transform-origin: top center; }
          }
          @media screen and (min-width: 769px) and (max-width: 1024px) {
            .page-wrapper { width: 100%; margin: 0; transform: scale(0.85); transform-origin: top center; }
          }
        </style>
      </head>
      <body>
        <div class="page-wrapper">
        <div class="container">
          <div style="text-align: right; font-size: 7pt; color: #666; margin-bottom: 5px; padding-right: 5px;">
            REC-FORM 009/REV 00/17 AUG 2022
          </div>
          <div class="header">
            <div class="logo-placeholder">
              <img src="/philfida-logo.png" alt="Logo" onerror="this.style.display='none'; this.parentElement.innerHTML='<span class=\\'logo-text\\'>[LOGO]</span>';" />
            </div>
            <div class="header-content">
              <div class="agency-name">Republic of the Philippines<br/>Department of Agriculture<br/><span class="bold">PHILIPPINE FIBER INDUSTRY DEVELOPMENT AUTHORITY</span><br/><span class="bold">REGIONAL OFFICE XIII</span></div>
              <div class="title">ACTION/ROUTING SLIP</div>
            </div>
          </div>

          <div style="text-align: right; font-size: 10pt; color: #333; margin-bottom: 10px;">
            <strong>No: ${globalPrintPreview.DocumentNo || globalPrintPreview.Title.match(/^\[\s*([^\]]+)\s*\]/)?.[1] || globalPrintPreview.TaskID}</strong>
          </div>
          <div class="field-row">
            <div class="field">
              <span class="field-label">DATE:</span>
              <span class="field-value">${new Date().toLocaleDateString()}</span>
            </div>
            <div class="field">
              <span class="field-label">FOR/TO:</span>
              <span class="field-value">${session?.Name || '—'}</span>
            </div>
          </div>

          <div class="checkboxes">
            <div class="checkbox-item">
              <div class="checkbox ${hasUrgent ? 'checked' : ''}"></div>
              <span>URGENT</span>
            </div>
            <div class="checkbox-item">
              <div class="checkbox ${hasPriority ? 'checked' : ''}"></div>
              <span>PRIORITY</span>
            </div>
            <div class="checkbox-item">
              <div class="checkbox ${hasConfidential ? 'checked' : ''}"></div>
              <span>CONFIDENTIAL</span>
            </div>
          </div>

          <div class="section">
            <div class="section-title">ACTION:</div>
            <div class="actions-grid">
              ${actionCheckboxesHtml}
            </div>
          </div>

          <div class="section">
            <div class="section-title">APPROVAL:</div>
            <div class="approval-section">
              <div class="approval-item"><div class="checkbox ${approvalStates.noted ? 'checked' : ''}"></div><span>NOTED</span></div>
              <div class="approval-item"><div class="checkbox ${approvalStates.approved ? 'checked' : ''}"></div><span>APPROVED</span></div>
              <div class="approval-item"><div class="checkbox ${approvalStates.disapproved ? 'checked' : ''}"></div><span>DISAPPROVED</span></div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">REMARKS:</div>
            <div class="remarks-box"><strong>Subject:</strong> ${globalPrintPreview.Title.replace(/^\[\s*[^\]]+\s*\]\s*/, '').trim() || globalPrintPreview.Title}<br/><br/>${remarksText}</div>
          </div>

          <div class="signature-section">
            <div class="signature-line"></div>
            <div class="signature-label">SAMUEL M. NACINO JR.</div>
            <div class="signature-label">OIC-Regional Director</div>
          </div>

        </div>
        </div>
      </body>
      </html>
    `
    
    const printWindow = window.open('', '_blank')
    printWindow.document.write(printContent)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
    printWindow.close()
    setGlobalPrintPreview(null)
  }

  function parseCheckboxesFromTask(task) {
    // Parse checkbox states from database fields
    // Handle both old format (plain strings) and new format (JSON arrays)
    let priorityFlags = []
    let purposeCheckboxes = []
    
    try {
      if (task.PriorityFlags) {
        // Try to parse as JSON array first
        priorityFlags = JSON.parse(task.PriorityFlags)
      }
    } catch (e) {
      // If parsing fails, treat as old format: single string or comma-separated
      if (typeof task.PriorityFlags === 'string') {
        priorityFlags = task.PriorityFlags.split(',').map(s => s.trim()).filter(Boolean)
      }
    }

    try {
      if (task.PurposeCheckboxes) {
        // Try to parse as JSON array first
        purposeCheckboxes = JSON.parse(task.PurposeCheckboxes)
      }
    } catch (e) {
      // If parsing fails, treat as old format: single string or comma-separated
      if (typeof task.PurposeCheckboxes === 'string') {
        purposeCheckboxes = task.PurposeCheckboxes.split(',').map(s => s.trim()).filter(Boolean)
      }
    }

    // Fallback: if no purpose checkboxes found, try to parse from instructions
    if (purposeCheckboxes.length === 0) {
      const instructions = task.Description || task.Instructions || ''
      const purposeMatch = instructions.match(/Purpose:\s*(.*?)(?=\nAction:|\nRemarks:|\nFrom:|$)/i)
      if (purposeMatch && purposeMatch[1]) {
        // Parse comma-separated purposes from instructions
        purposeCheckboxes = purposeMatch[1].split(',').map(s => s.trim()).filter(Boolean)
      }
    }

    const approvalAction = task.ApprovalAction || ''

    // Map priority flags
    const hasUrgent = priorityFlags.includes('Urgent') || task.Priority === 'Urgent' || task.Priority === 'High'
    const hasPriority = priorityFlags.includes('Priority') || task.Priority === 'Medium'
    const hasConfidential = priorityFlags.includes('Confidential') || task.Category === 'Confidential'

    // Map purpose checkboxes - check for all possible options
    const checkboxStates = {
      compliance: purposeCheckboxes.includes('For compliance'),
      appropriateAction: purposeCheckboxes.includes('For appropriate action'),
      info: purposeCheckboxes.includes('For information'),
      review: purposeCheckboxes.includes('Please review/comment'),
      draftReply: purposeCheckboxes.includes('Please draft reply'),
      monitor: purposeCheckboxes.includes('Please monitor/follow up'),
      handle: purposeCheckboxes.includes('Please handle'),
      attend: purposeCheckboxes.includes('Please attend'),
      seeMe: purposeCheckboxes.includes('Please see me'),
      disseminate: purposeCheckboxes.includes('Please disseminate/circulate'),
      returnForward: purposeCheckboxes.includes('Please return/forward to:'),
      schedule: purposeCheckboxes.includes('Please schedule'),
      file: purposeCheckboxes.includes('Please file'),
    }

    // Map approval action
    const approvalStates = {
      noted: approvalAction === 'Noted',
      approved: approvalAction === 'Approved',
      disapproved: approvalAction === 'Disapproved',
    }

    return {
      hasUrgent,
      hasPriority,
      hasConfidential,
      checkboxStates,
      approvalStates,
      allPurposes: purposeCheckboxes, // Return all purposes for dynamic rendering
    }
  }

  const activeCount    = myTasks.filter(t => t.Status !== 'Completed').length
  const completedCount = myTasks.filter(t => t.Status === 'Completed').length

  return (
    <div className="h-dvh flex overflow-hidden" style={{ background: '#f0f4f0' }}>

      {/* Global Print Preview Modal - Above all divs */}
      {globalPrintPreview && (
        <div className="fixed inset-0 bg-black/50 z-[99999] flex items-center justify-center p-2 sm:p-4" onClick={() => setGlobalPrintPreview(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="font-bold text-lg text-slate-800">Print Preview - Action/Routing Slip</h3>
              <button onClick={() => setGlobalPrintPreview(null)} className="text-slate-400 hover:text-slate-600 text-2xl">&times;</button>
            </div>
            <div className="overflow-auto p-6 bg-slate-100" style={{ maxHeight: 'calc(90vh - 140px)' }}>
              <div className="bg-white p-6 rounded-lg border border-slate-200">
                <div className="mb-4">
                  <h4 className="font-semibold text-slate-800 mb-2">{globalPrintPreview.Title.replace(/^\[\s*[^\]]+\s*\]\s*/, '').trim() || globalPrintPreview.Title}</h4>
                  {globalPrintPreview.DocumentNo && (
                    <p className="text-sm text-slate-600 mb-2">Document No: {globalPrintPreview.DocumentNo}</p>
                  )}
                </div>
                
                {/* Document Preview */}
                <div className="mb-6 border border-slate-200 rounded-lg overflow-hidden bg-white">
                  <div className="mx-auto" style={{ maxWidth: '210mm', fontFamily: 'Cambria, "Times New Roman", serif', lineHeight: '1.4', fontSize: '12pt', padding: '15mm', border: '1px solid #ccc', background: '#fff' }}>
                    <div style={{ textAlign: 'right', fontSize: '7pt', color: '#666', marginBottom: '5px', paddingRight: '5px' }}>
                      REC-FORM 009/REV 00/17 AUG 2022
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '20px' }}>
                      <div style={{ width: '80px', height: '80px', border: '1px dashed #999', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: '0', background: '#f9f9f9' }}>
                        <img src="/philfida-logo.png" alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                             onError={e => { e.target.style.display='none'; e.target.parentElement.innerHTML='<span style=\"font-size:8pt;color:#999\">[LOGO]</span>'; }} />
                      </div>
                      <div style={{ flex: '1', textAlign: 'left' }}>
                        <div style={{ fontSize: '11pt', marginBottom: '5px' }}>
                          Republic of the Philippines<br/>
                          Department of Agriculture<br/>
                          <span style={{ fontWeight: 'bold' }}>PHILIPPINE FIBER INDUSTRY DEVELOPMENT AUTHORITY</span><br/>
                          <span style={{ fontWeight: 'bold' }}>REGIONAL OFFICE XIII</span>
                        </div>
                        <div style={{ fontSize: '11pt', fontWeight: 'bold', textAlign: 'center', marginTop: '5px' }}>ACTION/ROUTING SLIP</div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', fontSize: '10pt', color: '#333', marginBottom: '10px' }}>
                      <strong>No: {globalPrintPreview.DocumentNo || globalPrintPreview.Title.match(/^\[\s*([^\]]+)\s*\]/)?.[1] || globalPrintPreview.TaskID}</strong>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '15px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #000', padding: '5px 0' }}>
                        <span style={{ fontWeight: 'bold', minWidth: '100px', fontSize: '10pt' }}>DATE:</span>
                        <span style={{ fontSize: '10pt' }}>{new Date().toLocaleDateString()}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #000', padding: '5px 0' }}>
                        <span style={{ fontWeight: 'bold', minWidth: '100px', fontSize: '10pt' }}>FOR/TO:</span>
                        <span style={{ fontSize: '10pt' }}>{session?.Name || '—'}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '40px', margin: '20px 0', padding: '10px 0', borderBottom: '1px solid #000' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '18px', height: '18px', border: '2px solid #000', backgroundColor: parseCheckboxesFromTask(globalPrintPreview).hasUrgent ? '#000' : 'transparent' }}></div>
                        <span style={{ fontSize: '10pt' }}>URGENT</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '18px', height: '18px', border: '2px solid #000', backgroundColor: parseCheckboxesFromTask(globalPrintPreview).hasPriority ? '#000' : 'transparent' }}></div>
                        <span style={{ fontSize: '10pt' }}>PRIORITY</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '18px', height: '18px', border: '2px solid #000', backgroundColor: parseCheckboxesFromTask(globalPrintPreview).hasConfidential ? '#000' : 'transparent' }}></div>
                        <span style={{ fontSize: '10pt' }}>CONFIDENTIAL</span>
                      </div>
                    </div>

                    <div style={{ margin: '20px 0', padding: '15px', border: '1px solid #000' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '10px', textTransform: 'uppercase', fontSize: '11pt' }}>ACTION:</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        {[
                          'For compliance',
                          'For appropriate action', 
                          'For information',
                          'Please review/comment',
                          'Please draft reply',
                          'Please monitor/follow up',
                          'Please handle',
                          'Please attend',
                          'Please see me',
                          'Please disseminate/circulate',
                          'Please return/forward to:',
                          'Please schedule',
                          'Please file',
                        ].map(option => {
                          const isChecked = parseCheckboxesFromTask(globalPrintPreview).allPurposes.includes(option)
                          return (
                            <div key={option} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ width: '18px', height: '18px', border: '2px solid #000', backgroundColor: isChecked ? '#000' : 'transparent' }}></div>
                              <span style={{ fontSize: '10pt' }}>{option}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <div style={{ margin: '20px 0', padding: '15px', border: '1px solid #000' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '10px', textTransform: 'uppercase', fontSize: '11pt' }}>APPROVAL:</div>
                      <div style={{ display: 'flex', gap: '40px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '18px', height: '18px', border: '2px solid #000', backgroundColor: parseCheckboxesFromTask(globalPrintPreview).approvalStates.noted ? '#000' : 'transparent' }}></div>
                          <span style={{ fontSize: '10pt' }}>NOTED</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '18px', height: '18px', border: '2px solid #000', backgroundColor: parseCheckboxesFromTask(globalPrintPreview).approvalStates.approved ? '#000' : 'transparent' }}></div>
                          <span style={{ fontSize: '10pt' }}>APPROVED</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '18px', height: '18px', border: '2px solid #000', backgroundColor: parseCheckboxesFromTask(globalPrintPreview).approvalStates.disapproved ? '#000' : 'transparent' }}></div>
                          <span style={{ fontSize: '10pt' }}>DISAPPROVED</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ margin: '20px 0', padding: '15px', border: '1px solid #000' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '10px', textTransform: 'uppercase', fontSize: '11pt' }}>REMARKS:</div>
                      <div style={{ minHeight: '100px', padding: '10px', marginTop: '10px', border: '1px solid #000', whiteSpace: 'pre-wrap', fontSize: '10pt' }}>
                        <strong>Subject:</strong> {globalPrintPreview.Title.replace(/^\[\s*[^\]]+\s*\]\s*/, '').trim() || globalPrintPreview.Title}<br/><br/>
                        {(() => {
                          const text = globalPrintPreview.Description || globalPrintPreview.Instructions || ''
                          return text
                            .replace(/^Purpose:[\s\S]*?(?=Action:|Remarks:|$)/mi, '')
                            .replace(/^Action:.*$/gmi, '')
                            .replace(/^From:.*$/gmi, '')
                            .replace(/\n\n+/g, '\n')
                            .trim() || 'Please acknowledge the receipt of this document. Thanks.'
                        })()}
                      </div>
                    </div>

                    <div style={{ marginTop: '40px', textAlign: 'center' }}>
                      <div style={{ borderBottom: '2px solid #000', width: '300px', margin: '40px auto 10px auto' }}></div>
                      <div style={{ fontSize: '10pt', fontWeight: 'bold' }}>SAMUEL M. NACINO JR.</div>
                      <div style={{ fontSize: '10pt', fontWeight: 'bold' }}>OIC-Regional Director</div>
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-end gap-3">
                  <button onClick={() => setGlobalPrintPreview(null)} className="px-6 py-2 rounded-lg font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50">
                    Cancel
                  </button>
                  <button onClick={handleConfirmGlobalPrint} className="px-6 py-2 rounded-lg font-semibold text-white bg-green-700 hover:bg-green-800">
                    <i className="bi bi-printer-fill mr-2" /> Print
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SIDEBAR OVERLAY (mobile) ── */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={`sidebar-responsive fixed md:relative inset-y-0 left-0 z-50 md:z-auto flex flex-col flex-shrink-0 h-full transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`} style={{ background: 'linear-gradient(180deg, #014d2a 0%, #016837 100%)' }}>

        {/* ── Branding + Notification row ── */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center flex-shrink-0 border border-white/20 shadow-inner">
              <img src="/philfida-logo.png" alt="PhilFIDA" className="w-6 h-6 object-contain"
                onError={e => { e.target.style.display='none'; e.target.parentElement.innerHTML='<span style="font-size:10px;font-weight:900;color:white;">PF</span>' }} />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-white font-black text-[11px] tracking-wider uppercase leading-none">PhilFIDA</span>
              <span className="text-green-300 font-bold text-[10px] mt-0.5 leading-none">TaskFlow</span>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {session?.Region && (
              <span className="region-badge px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter bg-white/10 text-white border border-white/20 mr-1">
                {session.Region}
              </span>
            )}
            <NotificationBell />
            <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1 text-green-300 hover:text-white transition-colors">
              <i className="bi bi-x-lg text-base" />
            </button>
          </div>
        </div>

        {/* ── Nav ── */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          <button
            onClick={() => setTab('my-tasks')}
            className={`nav-item w-full text-left ${tab === 'my-tasks' ? 'active' : ''}`}
          >
            <i className="bi bi-grid-fill text-base" />
            <span className="flex-1 text-sm">My Assignments</span>
            {activeCount > 0 && (
              <span className="w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {activeCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('profile')}
            className={`nav-item w-full text-left mt-1 ${tab === 'profile' ? 'active' : ''}`}
          >
            <i className="bi bi-person-circle text-base" />
            <span className="flex-1 text-sm">My Profile</span>
          </button>
        </nav>
      </aside>


      {/* ── MAIN ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Mobile top bar */}
        <div className="md:hidden sticky top-0 z-40 glass-effect flex items-center justify-between px-4 py-3 bg-white/80 border-b border-slate-200 flex-shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 -ml-1 text-slate-600 hover:text-green-800 transition-colors">
            <i className="bi bi-list text-2xl" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-green-900 rounded-lg flex items-center justify-center overflow-hidden shadow-md">
              <img src="/philfida-logo.png" alt="" className="w-5 h-5 object-contain" onError={e => e.target.style.display='none'} />
            </div>
            <span className="text-green-900 font-black text-sm tracking-tight uppercase">TaskFlow</span>
            <span className="text-[10px] font-bold text-green-600/70 border-l border-slate-300 pl-2">{session?.Region}</span>
          </div>
          <NotificationBell />
        </div>

        <main className="flex-1 overflow-y-auto flex flex-col md:pb-0 pb-16">

          {/* ── TOP BAR ── */}
          {tab === 'my-tasks' && (
            <>
              <div className="flex items-center justify-between px-4 md:px-6 lg:px-8 py-4 border-b border-slate-200 bg-white flex-shrink-0 gap-2 min-w-0">
                <div className="min-w-0">
                  <h2 className="font-bold text-green-900 text-base sm:text-lg leading-none">
                    My Assignments <span className="text-green-600 font-medium">— {session?.Region}</span>
                  </h2>
                  <p className="text-slate-400 text-[10px] sm:text-xs mt-1.5 font-medium">{session?.Designation || session?.Role} — {session?.Office || session?.Unit}</p>
                </div>
              </div>

              {myTasks.length > 0 && (
                <div className="px-3 sm:px-4 md:px-6 lg:px-8 py-3 border-b border-slate-200 bg-white flex-shrink-0 flex items-center gap-2 flex-wrap">
                  <div className="relative flex-1 min-w-[140px] max-w-sm">
                    <i className="bi bi-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
                    <input
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all outline-none"
                      placeholder="Search tasks..."
                      value={filterSearch}
                      onChange={e => setFilterSearch(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <select 
                      className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 outline-none focus:ring-2 focus:ring-green-500/20"
                      value={filterStatus} 
                      onChange={e => setFilterStatus(e.target.value)}
                    >
                      <option value="All">All Status</option>
                      <option value="Assigned">Assigned</option>
                      <option value="Received">Received</option>
                      <option value="Completed">Completed</option>
                    </select>
                  </div>
                  {(filterStatus !== 'All' || filterSearch) && (
                    <button onClick={() => { setFilterStatus('All'); setFilterSearch('') }}
                      className="px-3 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all flex items-center gap-1.5">
                      <i className="bi bi-x-circle-fill" /> Reset
                    </button>
                  )}
                </div>
              )}

              {/* ── TASK CONTENT ── */}
              <div className="flex-1 overflow-auto px-4 md:px-6 lg:px-8 pt-4 pb-0">
                {myTasks.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm max-w-full mb-4 text-center py-16">
                <i className="bi bi-clipboard-x text-3xl block mb-2 opacity-30 text-slate-400" />
                <p className="text-slate-400">No tasks assigned yet.</p>
              </div>
            ) : (
              <>
                {/* Stats Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                    <div className="text-2xl font-bold text-emerald-600">{activeCount}</div>
                    <div className="text-xs text-slate-500 font-medium mt-1">Active Tasks</div>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                    <div className="text-2xl font-bold text-blue-600">{completedCount}</div>
                    <div className="text-xs text-slate-500 font-medium mt-1">Completed</div>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                    <div className="text-2xl font-bold text-purple-600">{myTasks.length}</div>
                    <div className="text-xs text-slate-500 font-medium mt-1">Total Tasks</div>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
                    <div className="text-2xl font-bold text-orange-600">
                      {Math.round((completedCount / myTasks.length) * 100) || 0}%
                    </div>
                    <div className="text-xs text-slate-500 font-medium mt-1">Completion Rate</div>
                  </div>
                </div>

                {/* Task Cards */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm max-w-full mb-4">
                  <div className="p-4 md:p-6 lg:p-8 space-y-4">
                    {filteredMyTasks.length === 0 ? (
                      <div className="text-center py-12 text-slate-400">
                        <i className="bi bi-search text-3xl block mb-2 opacity-30" />
                        <p>No matching tasks found for your search/filters.</p>
                      </div>
                    ) : filteredMyTasks.map(t => (
                      <TaskCard
                        key={t.TaskID}
                        task={t}
                        session={session}
                        comments={globalData.comments}
                        loading={loadingTask === t.TaskID}
                        history={globalData.history.filter(h => String(h.TaskID) === String(t.TaskID))}
                        onStatusUpdate={handleStatusUpdate}
                        onOpenChat={() => setChat({ taskId: t.TaskID, taskTitle: t.Title })}
                        onOpenFile={(url, name) => setLightboxFile({ url, name })}
                        onPrintPreview={() => handleGlobalPrintPreview(t)}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {tab === 'profile' && (
        <UserProfileTab presence={presence} setPresence={setPresence} />
      )}
    </main>

        {/* FOOTER */}
        <footer className="bg-white border-t border-slate-100/80 py-1.5 sm:py-2 px-3 sm:px-4 md:px-6 lg:px-8 flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[9px] sm:text-[10px] text-slate-400 truncate">© {new Date().getFullYear()} PhilFIDA</p>
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <span className="text-[9px] sm:text-[10px] text-slate-400 hidden sm:inline">User Dashboard</span>
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-gradient-to-r from-[#016837] to-[#027a42]"></span>
            </div>
          </div>
        </footer>
      </div>

      {/* ── MOBILE BOTTOM NAV ── */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-slate-200 flex z-30 shadow-lg">
        <button
          onClick={() => setTab('my-tasks')}
          className={`flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-semibold transition-colors relative ${tab === 'my-tasks' ? 'text-green-800' : 'text-slate-400'}`}
        >
          <i className="bi bi-grid-fill text-xl" />
          Assignments
          {activeCount > 0 && (
            <span className="absolute top-2 right-1/4 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
              {activeCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('profile')}
          className={`flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-semibold transition-colors relative ${tab === 'profile' ? 'text-green-800' : 'text-slate-400'}`}
        >
          <i className="bi bi-person-circle text-xl" />
          Profile
        </button>
      </nav>

      {chat         && <ChatModal taskId={chat.taskId} taskTitle={chat.taskTitle} onClose={() => setChat(null)} onSync={sync} />}
      {lightboxFile && <Lightbox file={lightboxFile} onClose={() => setLightboxFile(null)} />}
    </div>
  )
}

function TaskCard({ task: t, session, comments, history = [], loading, onStatusUpdate, onOpenChat, onOpenFile, onPrintPreview }) {
  const unreadChat = getUnreadCommentCount(comments, t.TaskID, session.Name)

  function parseCheckboxesFromTask(task) {
    // Parse checkbox states from database fields
    // Handle both old format (plain strings) and new format (JSON arrays)
    let priorityFlags = []
    let purposeCheckboxes = []
    
    try {
      if (task.PriorityFlags) {
        // Try to parse as JSON array first
        priorityFlags = JSON.parse(task.PriorityFlags)
      }
    } catch (e) {
      // If parsing fails, treat as old format: single string or comma-separated
      if (typeof task.PriorityFlags === 'string') {
        priorityFlags = task.PriorityFlags.split(',').map(s => s.trim()).filter(Boolean)
      }
    }

    try {
      if (task.PurposeCheckboxes) {
        // Try to parse as JSON array first
        purposeCheckboxes = JSON.parse(task.PurposeCheckboxes)
      }
    } catch (e) {
      // If parsing fails, treat as old format: single string or comma-separated
      if (typeof task.PurposeCheckboxes === 'string') {
        purposeCheckboxes = task.PurposeCheckboxes.split(',').map(s => s.trim()).filter(Boolean)
      }
    }

    // Fallback: if no purpose checkboxes found, try to parse from instructions
    if (purposeCheckboxes.length === 0) {
      const instructions = task.Description || task.Instructions || ''
      const purposeMatch = instructions.match(/Purpose:\s*(.*?)(?=\nAction:|\nRemarks:|\nFrom:|$)/i)
      if (purposeMatch && purposeMatch[1]) {
        // Parse comma-separated purposes from instructions
        purposeCheckboxes = purposeMatch[1].split(',').map(s => s.trim()).filter(Boolean)
      }
    }

    const approvalAction = task.ApprovalAction || ''

    // Map priority flags
    const hasUrgent = priorityFlags.includes('Urgent') || task.Priority === 'Urgent' || task.Priority === 'High'
    const hasPriority = priorityFlags.includes('Priority') || task.Priority === 'Medium'
    const hasConfidential = priorityFlags.includes('Confidential') || task.Category === 'Confidential'

    // Map purpose checkboxes - check for all possible options
    const checkboxStates = {
      compliance: purposeCheckboxes.includes('For compliance'),
      appropriateAction: purposeCheckboxes.includes('For appropriate action'),
      info: purposeCheckboxes.includes('For information'),
      review: purposeCheckboxes.includes('Please review/comment'),
      draftReply: purposeCheckboxes.includes('Please draft reply'),
      monitor: purposeCheckboxes.includes('Please monitor/follow up'),
      handle: purposeCheckboxes.includes('Please handle'),
      attend: purposeCheckboxes.includes('Please attend'),
      seeMe: purposeCheckboxes.includes('Please see me'),
      disseminate: purposeCheckboxes.includes('Please disseminate/circulate'),
      returnForward: purposeCheckboxes.includes('Please return/forward to:'),
      schedule: purposeCheckboxes.includes('Please schedule'),
      file: purposeCheckboxes.includes('Please file'),
    }

    // Map approval action
    const approvalStates = {
      noted: approvalAction === 'Noted',
      approved: approvalAction === 'Approved',
      disapproved: approvalAction === 'Disapproved',
    }

    return {
      hasUrgent,
      hasPriority,
      hasConfidential,
      checkboxStates,
      approvalStates,
      allPurposes: purposeCheckboxes, // Return all purposes for dynamic rendering
    }
  }



  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col h-full overflow-hidden animate-in-up group">

      {/* ── SECTION 1: Task Header ── */}
      <div className="bg-slate-50/50 px-3 sm:px-4 py-3 border-b border-slate-100 group-hover:bg-green-50/30 transition-colors">
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          {/* Task ID & Status */}
          <div className="min-w-0 flex-1 flex items-center gap-1.5 sm:gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium">Assigned to you</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Comments indicator */}
            {unreadChat > 0 && (
              <button
                onClick={onOpenChat}
                className="flex items-center gap-1.5 px-2 py-1 bg-red-50 border border-red-100 rounded-full text-red-600 hover:bg-red-100 transition-colors"
              >
                <i className="bi bi-chat-dots-fill text-[12px]" />
                <span className="text-[11px] font-bold">{unreadChat > 9 ? '9+' : unreadChat}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── SECTION 2: Task Details ── */}
      <div className="px-3 sm:px-4 py-4 border-b border-slate-100 bg-white">
        {/* Document Number Badge - Modern Stacked Layout */}
        {(t.DocumentNo || /^\[\s*[^\]]+\s*\]/.test(t.Title)) && (
          <div className="mb-2">
            <span className="inline-flex items-center gap-1.5 bg-slate-800 text-white rounded-md px-2.5 py-1.5 shadow-sm hover:scale-[1.02] transition-transform">
              <i className="bi bi-hash text-green-400 text-[12px] sm:text-sm font-bold" />
              <span className="text-[10px] sm:text-[11px] font-bold tracking-widest uppercase">
                {t.DocumentNo || t.Title.match(/^\[\s*([^\]]+)\s*\]/)?.[1] || '—'}
              </span>
            </span>
          </div>
        )}
        {/* Clean Title - Document Number Extracted */}
        <p className="font-semibold text-slate-800 text-sm sm:text-base leading-snug">
          {t.Title.replace(/^\[\s*[^\]]+\s*\]\s*/, '').trim() || t.Title}
        </p>
        {/* Category badge */}
        {t.Category && (
          <span className="text-[10px] sm:text-[11px] font-medium bg-slate-100 text-slate-600 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded mt-1.5 sm:mt-2 inline-block">
            {t.Category}
          </span>
        )}
      </div>

      {/* ── SECTION 3: File & Meta ── */}
      {t.FileLink && (
        <div className="px-3 sm:px-4 py-1.5 sm:py-2 bg-slate-50/30 border-b border-slate-100 flex flex-wrap gap-2">
          {t.FileLink.split('|').filter(Boolean).map((url, idx) => {
            const name = decodeURIComponent(url.split('?')[0].split('/').pop())
            return (
              <button key={idx} onClick={() => onOpenFile(url, name)}
                className="text-[10px] sm:text-[11px] font-medium text-green-700 hover:text-green-800 flex items-center gap-1 sm:gap-1.5 py-1 bg-green-50 px-2 rounded border border-green-100 truncate max-w-[200px]">
                <i className="bi bi-paperclip flex-shrink-0" /> <span className="truncate">{name}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── SECTION 4: Status Grid ── */}
      <div className="grid grid-cols-3 gap-0 divide-x divide-slate-100">
        <div className="px-2 sm:px-3 py-2 sm:py-3 text-center">
          <p className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 sm:mb-1">Status</p>
          <span className={getStatusBadgeClass(t.Status)}>{t.Status}</span>
        </div>
        <div className="px-2 sm:px-3 py-2 sm:py-3 text-center">
          <p className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 sm:mb-1">Priority</p>
          {t.Priority ? <span className={getPriorityClass(t.Priority)}>{t.Priority}</span> : <span className="text-[10px] sm:text-xs text-slate-300">—</span>}
        </div>
        <div className="px-2 sm:px-3 py-2 sm:py-3 text-center">
          <p className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 sm:mb-1">Deadline</p>
          {t.Deadline
            ? <p className="text-[10px] sm:text-xs text-red-500 font-semibold">{new Date(t.Deadline).toLocaleDateString()}</p>
            : <p className="text-[10px] sm:text-xs text-slate-300">—</p>}
        </div>
      </div>

      {/* ── SECTION 5: Timeline ── */}
      <div className="px-3 sm:px-4 py-1.5 sm:py-2 bg-slate-50/30">
        <TaskTimeline task={t} history={history} />
      </div>

      {/* ── SECTION 6: Progress ── */}
      {t.Deadline && t.Status !== 'Completed' && (
        <div className="px-3 sm:px-4 pb-2.5 sm:pb-3 pt-0.5 sm:pt-1">
          <DeadlineProgress task={t} />
        </div>
      )}

      {/* ── SECTION 7: Actions ── */}
      <div className="px-3 sm:px-4 py-3 border-t border-slate-100 bg-white">
        <div className="flex gap-2">
          {t.Status === 'Assigned' && (
            <button 
              disabled={loading} 
              onClick={() => onStatusUpdate(t.TaskID, 'Received')} 
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm text-white shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
              style={{
                background: 'linear-gradient(135deg, #016837 0%, #027a42 50%, #016837 100%)',
                border: '1px solid rgba(255,255,255,0.15)',
                boxShadow: '0 4px 12px rgba(16, 71, 17, 0.25), inset 0 1px 0 rgba(255,255,255,0.2)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, #027a42 0%, #038c4d 50%, #027a42 100%)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 71, 17, 0.35), inset 0 1px 0 rgba(255,255,255,0.25)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, #016837 0%, #027a42 50%, #016837 100%)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 71, 17, 0.25), inset 0 1px 0 rgba(255,255,255,0.2)';
              }}
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
              ) : (
                <><i className="bi bi-check-lg" /> Accept Task</>
              )}
            </button>
          )}
          {t.Status === 'Received' && (
            <button 
              disabled={loading} 
              onClick={() => onStatusUpdate(t.TaskID, 'Completed')} 
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm text-white shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
              style={{
                background: 'linear-gradient(135deg, #16a34a, #15803d)',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'linear-gradient(135deg, #15803d, #166534)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'linear-gradient(135deg, #16a34a, #15803d)'}
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
              ) : (
                <><i className="bi bi-check-lg" /> Complete Task</>
              )}
            </button>
          )}
          {t.Status === 'Completed' && (
            <button disabled className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm text-white bg-slate-400 cursor-not-allowed">
              <i className="bi bi-check-circle-fill" /> Completed
            </button>
          )}
          <button 
            onClick={onOpenChat} 
            className="flex-shrink-0 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all relative"
          >
            <i className="bi bi-chat-text-fill text-green-700" />
            Chat
            {unreadChat > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs font-bold rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                {unreadChat > 9 ? '9+' : unreadChat}
              </span>
            )}
          </button>
          <button
            onClick={() => onPrintPreview && onPrintPreview(t)}
            className="flex-shrink-0 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all"
            title="Print task"
          >
            <i className="bi bi-printer-fill text-slate-600" />
          </button>
        </div>
      </div>
    </div>
  )
}