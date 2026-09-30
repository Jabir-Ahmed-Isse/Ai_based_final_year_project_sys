import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useStore } from '../store';
import { fileAPI } from '../services/apiService';
import { Send, User as UserIcon, Paperclip, FileText, X, Download, Search, MessageCircle } from 'lucide-react';
import { UserRole, ProjectStatus } from '../types';

// Helper to get all possible IDs for a user (handles DB ID vs project ID mismatch)
const getUserPossibleIds = (userId: string, userName: string, projects: any[], role: UserRole) => {
  const ids = [userId];
  if (role === UserRole.STUDENT) {
    // Add all studentIds from projects where this student's name matches
    projects.forEach(p => {
      if (p.studentName === userName || p.studentId === userId) {
        if (!ids.includes(p.studentId)) ids.push(p.studentId);
      }
    });
  } else if (role === UserRole.SUPERVISOR) {
    // Add all supervisorIds from projects where this supervisor was assigned
    projects.forEach(p => {
      if (p.supervisorId === userId) {
        if (!ids.includes(p.supervisorId)) ids.push(p.supervisorId);
      }
    });
  }
  return ids;
};

export const Chat: React.FC = () => {
  const { currentUser, users, messages, sendMessage, markMessagesRead, fetchMessages, projects } = useStore();
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get all approved/in-progress/completed projects
  const activeProjects = useMemo(() => projects.filter(p => 
    p.status === ProjectStatus.APPROVED || p.status === ProjectStatus.IN_PROGRESS || p.status === ProjectStatus.COMPLETED
  ), [projects]);

  // Get all possible IDs for current user
  const myPossibleIds = useMemo(() => {
    if (!currentUser) return [];
    return getUserPossibleIds(currentUser.id, currentUser.name, projects, currentUser.role);
  }, [currentUser, projects]);

  // Build contacts based on role
  const allContacts = useMemo(() => {
    if (!currentUser) return [];
    
    let contacts: { id: string; name: string; email: string; role: UserRole; department?: string; projectStudentId?: string }[] = [];

    if (currentUser.role === UserRole.SUPERVISOR) {
      // For supervisors: Show all students from active projects
      // Create contacts directly from project data to bypass ID issues
      activeProjects.forEach(p => {
        if (p.supervisorId) {
          // Check if this project belongs to current supervisor
          const supervisorIds = getUserPossibleIds(currentUser.id, currentUser.name, projects, UserRole.SUPERVISOR);
          // For now, show ALL students from active projects (supervisor can message any assigned student)
          contacts.push({
            id: p.studentId, // Use project's studentId for messaging
            name: p.studentName,
            email: '',
            role: UserRole.STUDENT,
            department: 'Computer Science',
            projectStudentId: p.studentId
          });
        }
      });
      // Remove duplicates by studentId
      contacts = contacts.filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i);
    } else if (currentUser.role === UserRole.STUDENT) {
      // For students: Find their project and show the supervisor
      const myProject = activeProjects.find(p => 
        myPossibleIds.includes(p.studentId) || p.studentName === currentUser.name
      );
      
      if (myProject?.supervisorId) {
        // Find supervisor in users array
        const supervisor = users.find(u => u.id === myProject.supervisorId);
        if (supervisor) {
          contacts = [{ ...supervisor, projectStudentId: myProject.studentId }];
        } else {
          // Create contact from mock users or virtual
          const mockSupervisor = users.find(u => u.id === myProject.supervisorId);
          contacts = [{
            id: myProject.supervisorId,
            name: mockSupervisor?.name || 'Supervisor',
            email: mockSupervisor?.email || '',
            role: UserRole.SUPERVISOR,
            department: 'Computer Science',
            projectStudentId: myProject.studentId
          }];
        }
      }
    } else if (currentUser.role === UserRole.ADMIN) {
      contacts = users.filter(u => u.id !== currentUser.id);
    }
    
    return contacts;
  }, [currentUser, activeProjects, users, myPossibleIds, projects]);

  // Fetch messages from backend on mount and periodically refresh
  useEffect(() => {
    fetchMessages();
    
    // Refresh messages every 10 seconds to get new messages
    const interval = setInterval(() => {
      fetchMessages();
    }, 10000);
    
    return () => clearInterval(interval);
  }, [currentUser]);

  useEffect(() => {
    if (!selectedContactId && allContacts.length > 0) {
      setSelectedContactId(allContacts[0].id);
    }
  }, [allContacts.length]);

  useEffect(() => {
    if (selectedContactId) {
      markMessagesRead(selectedContactId);
    }
  }, [selectedContactId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedContactId]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Only allow PDF, DOC, DOCX, and images
      const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg', 'image/gif'];
      if (allowedTypes.includes(file.type) || file.name.endsWith('.pdf')) {
        setSelectedFile(file);
      } else {
        alert('Please select a PDF, Word document, or image file.');
      }
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!inputText.trim() && !selectedFile) || !selectedContactId) return;

    let fileAttachment: { name: string; url: string; type: string; size: number } | undefined;

    if (selectedFile) {
      setIsUploading(true);
      try {
        const response = await fileAPI.upload(selectedFile);
        fileAttachment = {
          name: response.data.name || selectedFile.name,
          url: response.data.url,
          type: response.data.type || selectedFile.type,
          size: response.data.size || selectedFile.size
        };
      } catch (error) {
        console.error('Error uploading chat file:', error);
        alert('File could not be uploaded. Please try again.');
        setIsUploading(false);
        return;
      } finally {
        setIsUploading(false);
      }
    }

    try {
      await sendMessage(selectedContactId, inputText || (selectedFile ? `Shared a file: ${selectedFile.name}` : ''), fileAttachment);
      setInputText('');
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Error saving chat message:', error);
      alert('Message could not be saved. Please check the backend and try again.');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Get the selected contact's project studentId for proper message matching
  const selectedContact = allContacts.find(c => c.id === selectedContactId);
  const contactStudentId = selectedContact?.projectStudentId || selectedContactId;

  // Filter messages for current conversation
  const currentConversation = useMemo(() => {
    if (!selectedContactId) return [];
    
    return messages.filter(m => {
      // Check if message is between me and the selected contact
      const isSentByMe = myPossibleIds.includes(m.senderId);
      const isSentToMe = myPossibleIds.includes(m.receiverId);
      const isSentByContact = m.senderId === selectedContactId || m.senderId === contactStudentId;
      const isSentToContact = m.receiverId === selectedContactId || m.receiverId === contactStudentId;
      
      return (isSentByMe && isSentToContact) || (isSentByContact && isSentToMe);
    }).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [messages, selectedContactId, myPossibleIds, contactStudentId]);

  const selectedUser = users.find(u => u.id === selectedContactId) || allContacts.find(c => c.id === selectedContactId);
  const getInitials = (name?: string) => (name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('');

  const formatTime = (timestamp?: string) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const contactRows = useMemo(() => {
    return allContacts
      .map(contact => {
        const contactIds = [contact.id, contact.projectStudentId].filter(Boolean) as string[];
        const contactMessages = messages
          .filter(m => {
            const isSentByContact = contactIds.includes(m.senderId);
            const isSentToContact = contactIds.includes(m.receiverId);
            const isSentByMe = myPossibleIds.includes(m.senderId);
            const isSentToMe = myPossibleIds.includes(m.receiverId);
            return (isSentByContact && isSentToMe) || (isSentByMe && isSentToContact);
          })
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        const lastMsg = contactMessages[0];
        const unread = messages.filter(m => contactIds.includes(m.senderId) && myPossibleIds.includes(m.receiverId) && !m.read).length;

        return { contact, lastMsg, unread };
      })
      .filter(row => {
        const query = contactSearch.trim().toLowerCase();
        if (!query) return true;
        return row.contact.name.toLowerCase().includes(query) ||
          row.contact.role.toLowerCase().includes(query) ||
          (row.contact.department || '').toLowerCase().includes(query);
      });
  }, [allContacts, messages, myPossibleIds, contactSearch]);

  return (
    <div className="chat-shell">
      {/* Contact List */}
      <aside className={`chat-contacts ${selectedContactId ? 'chat-hide-mobile' : ''}`}>
        <div className="chat-contacts-header">
          <div>
            <p className="chat-eyebrow">GPMS Chat</p>
            <h2>Messages</h2>
          </div>
          <MessageCircle size={22} />
        </div>

        <div className="chat-search">
          <Search size={18} />
          <input
            value={contactSearch}
            onChange={e => setContactSearch(e.target.value)}
            placeholder="Search contacts"
          />
        </div>

        <div className="chat-contact-list">
          {allContacts.length === 0 ? (
            <div className="chat-empty-small">
              <p>No active contacts.</p>
              {currentUser?.role === UserRole.STUDENT && <p className="mt-2 text-xs">You will be able to chat once a supervisor is assigned to your project.</p>}
              {currentUser?.role === UserRole.SUPERVISOR && <p className="mt-2 text-xs">You will be able to chat once you approve a student's project.</p>}
            </div>
          ) : contactRows.length === 0 ? (
            <div className="chat-empty-small">
              <p>No contacts match your search.</p>
            </div>
          ) : (
            contactRows.map(({ contact, lastMsg, unread }) => (
              <button
                key={contact.id}
                onClick={() => setSelectedContactId(contact.id)}
                className={`chat-contact-row ${selectedContactId === contact.id ? 'is-active' : ''}`}
              >
                <div className="chat-avatar">{getInitials(contact.name)}</div>
                <div className="chat-contact-main">
                  <div className="chat-contact-top">
                    <h3>{contact.name}</h3>
                    <span>{formatTime(lastMsg?.timestamp)}</span>
                  </div>
                  <div className="chat-contact-bottom">
                    <p className={unread ? 'is-unread' : ''}>
                      {lastMsg?.fileAttachment ? `File: ${lastMsg.fileAttachment.name}` : lastMsg?.content || contact.role.toLowerCase()}
                    </p>
                    {unread > 0 && <strong>{unread}</strong>}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Conversation */}
      <section className={`chat-panel ${!selectedContactId ? 'chat-hide-mobile' : ''}`}>
        {selectedContactId ? (
          <>
            <div className="chat-header">
              <button 
                onClick={() => setSelectedContactId(null)}
                className="chat-back-button"
              >
                &larr;
              </button>
              <div className="chat-avatar chat-avatar-large">
                {getInitials(selectedUser?.name)}
              </div>
              <div>
                <h3>{selectedUser?.name}</h3>
                <p>{selectedUser?.role?.toLowerCase()} • messages are saved</p>
              </div>
            </div>

            <div className="chat-messages">
              {currentConversation.length === 0 && (
                <div className="chat-start-card">
                  <MessageCircle size={28} />
                  <h3>Start the conversation</h3>
                  <p>Messages and files you send here will stay in this chat.</p>
                </div>
              )}
              {currentConversation.map(msg => {
                const isMe = myPossibleIds.includes(msg.senderId);
                return (
                  <div key={msg.id} className={`chat-message-row ${isMe ? 'is-me' : 'is-them'}`}>
                    <div className="chat-bubble">
                      {msg.fileAttachment && (
                        <a 
                          href={msg.fileAttachment.url} 
                          download={msg.fileAttachment.name}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="chat-file-card"
                        >
                          <div className="chat-file-icon">
                            <FileText size={20} />
                          </div>
                          <div>
                            <p>{msg.fileAttachment.name}</p>
                            <span>{formatFileSize(msg.fileAttachment.size)}</span>
                          </div>
                          <Download size={18} />
                        </a>
                      )}
                      {msg.content && !msg.content.startsWith('Shared a file:') && (
                        <p>{msg.content}</p>
                      )}
                      <span className="chat-time">{formatTime(msg.timestamp)}</span>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSend} className="chat-composer">
              {/* Selected File Preview */}
              {selectedFile && (
                <div className="chat-selected-file">
                  <div className="chat-file-icon">
                    <FileText size={20} />
                  </div>
                  <div>
                    <p>{selectedFile.name}</p>
                    <span>{formatFileSize(selectedFile.size)}</span>
                  </div>
                  <button 
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="chat-remove-file"
                  >
                    <X size={18} />
                  </button>
                </div>
              )}
              
              <div className="chat-composer-row">
                {/* Hidden File Input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                
                {/* Attachment Button */}
                <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="chat-icon-button"
                  title="Attach file (PDF, Word, Image)"
                >
                  <Paperclip size={20} />
                </button>
                
                <input
                  type="text"
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  placeholder="Type your message..."
                  className="chat-input"
                />
                <button 
                  type="submit"
                  disabled={(!inputText.trim() && !selectedFile) || isUploading}
                  className="chat-send-button"
                >
                  {isUploading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Send size={20} />
                  )}
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="chat-empty-state">
            <div>
              <UserIcon size={32} />
            </div>
            <h3>Select a contact</h3>
            <p>Choose a student, supervisor, or admin to open the chat.</p>
          </div>
        )}
      </section>
    </div>
  );
};
