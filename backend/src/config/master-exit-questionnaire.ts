/**
 * Canonical Default Exit Interview Master Questionnaire
 * Extracted from the authentic Infravision questionnaire.
 * Preserves all 9 sections, questions, rating scales, and declaration terms.
 * Used as the base template copied into each company workspace upon onboarding.
 */

export interface QuestionnaireMatrixRow {
  id: string;
  label: string;
  required?: boolean;
}

export interface QuestionnaireQuestion {
  id: string;
  label: string;
  description?: string;
  type:
    | 'text'
    | 'textarea'
    | 'email'
    | 'phone'
    | 'number'
    | 'date'
    | 'radio'
    | 'checkbox'
    | 'dropdown'
    | 'rating'
    | 'rating_matrix'
    | 'yes_no';
  required: boolean;
  options?: string[];
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
  matrixRows?: QuestionnaireMatrixRow[];
  placeholder?: string;
  orderIndex: number;
}

export interface QuestionnaireSection {
  id: string;
  title: string;
  description?: string;
  orderIndex: number;
  questions: QuestionnaireQuestion[];
}

export interface ExitQuestionnaireSchema {
  introduction: string;
  sections: QuestionnaireSection[];
}

export const MASTER_EXIT_QUESTIONNAIRE: ExitQuestionnaireSchema = {
  introduction:
    'Dear Colleague, thank you for your contribution to the organisation. Your honest feedback helps us improve our workplace, retain talent and strengthen our processes. Please complete this form candidly. Your responses will be treated as confidential and used only for improvement purposes.',
  sections: [
    // Section A: Employee Details
    {
      id: 'section_a',
      title: 'Section A: Employee Details',
      description: 'Basic personnel and service records.',
      orderIndex: 0,
      questions: [
        {
          id: 'employee_name',
          label: 'Employee Name',
          type: 'text',
          required: true,
          orderIndex: 0,
        },
        {
          id: 'employee_id',
          label: 'Employee ID',
          type: 'text',
          required: true,
          orderIndex: 1,
        },
        {
          id: 'designation',
          label: 'Designation',
          type: 'text',
          required: true,
          orderIndex: 2,
        },
        {
          id: 'department',
          label: 'Department / Function',
          type: 'text',
          required: true,
          orderIndex: 3,
        },
        {
          id: 'reporting_manager',
          label: 'Reporting Manager',
          type: 'text',
          required: true,
          orderIndex: 4,
        },
        {
          id: 'location',
          label: 'Location / Site',
          type: 'text',
          required: true,
          orderIndex: 5,
        },
        {
          id: 'date_of_joining',
          label: 'Date of Joining',
          type: 'date',
          required: true,
          orderIndex: 6,
        },
        {
          id: 'date_of_resignation',
          label: 'Date of Resignation',
          type: 'date',
          required: true,
          orderIndex: 7,
        },
        {
          id: 'last_working_day',
          label: 'Last Working Day',
          type: 'date',
          required: true,
          orderIndex: 8,
        },
        {
          id: 'total_tenure',
          label: 'Total Tenure in Company',
          description: 'e.g. 2 years 3 months',
          type: 'text',
          required: true,
          orderIndex: 9,
        },
        {
          id: 'employment_type',
          label: 'Employment Type',
          type: 'radio',
          required: true,
          options: ['Permanent', 'Contract'],
          orderIndex: 10,
        },
      ],
    },

    // Section B: Reason(s) for Leaving
    {
      id: 'section_b',
      title: 'Section B: Reason(s) for Leaving',
      description: 'Understanding the factors behind your transition.',
      orderIndex: 1,
      questions: [
        {
          id: 'reasons_for_leaving',
          label: 'Reason(s) for leaving',
          description: 'Tick all that apply.',
          type: 'checkbox',
          required: true,
          options: [
            'Better career opportunity',
            'Higher compensation / benefits',
            'Lack of career growth / promotion',
            'Role not as expected',
            'Work-life balance',
            'Relationship with reporting manager',
            'Work culture / environment',
            'Workload / stress',
            'Relocation / commute / site posting',
            'Higher studies',
            'Personal / family reasons',
            'Health reasons',
            'Lack of learning & development',
            'Lack of recognition',
            'Job security / organisational changes',
            'Other',
          ],
          orderIndex: 0,
        },
        {
          id: 'primary_reason',
          label: 'Which ONE is your primary reason for leaving?',
          type: 'radio',
          required: true,
          options: [
            'Better career opportunity',
            'Higher compensation / benefits',
            'Lack of career growth / promotion',
            'Role not as expected',
            'Work-life balance',
            'Relationship with reporting manager',
            'Work culture / environment',
            'Workload / stress',
            'Relocation / commute / site posting',
            'Higher studies',
            'Personal / family reasons',
            'Health reasons',
            'Lack of learning & development',
            'Lack of recognition',
            'Job security / organisational changes',
            'Other',
          ],
          orderIndex: 1,
        },
        {
          id: 'reason_elaboration',
          label: 'Please elaborate on your main reason for leaving',
          type: 'textarea',
          required: true,
          orderIndex: 2,
        },
        {
          id: 'trigger_incident',
          label: 'Was there a specific incident or trigger that made you start looking for a new role?',
          type: 'textarea',
          required: false,
          orderIndex: 3,
        },
        {
          id: 'joining_another_org',
          label: 'Are you joining another organisation?',
          type: 'radio',
          required: true,
          options: ['Yes', 'No'],
          orderIndex: 4,
        },
        {
          id: 'new_org_industry',
          label: 'If yes: type of industry / role (optional)',
          type: 'text',
          required: false,
          orderIndex: 5,
        },
        {
          id: 'new_offer_comparison',
          label: 'Was the new offer better in terms of:',
          type: 'checkbox',
          required: false,
          options: ['Pay', 'Role', 'Growth', 'Location'],
          orderIndex: 6,
        },
      ],
    },

    // Section C: Your Role & Work Experience
    {
      id: 'section_c',
      title: 'Section C: Your Role & Work Experience',
      description: 'Rate the following on a scale of 1 to 5 (1 = Strongly Disagree, 5 = Strongly Agree)',
      orderIndex: 2,
      questions: [
        {
          id: 'role_ratings',
          label: 'Your role',
          description: '1 = Strongly Disagree, 5 = Strongly Agree',
          type: 'rating_matrix',
          required: true,
          min: 1,
          max: 5,
          minLabel: 'Strongly Disagree',
          maxLabel: 'Strongly Agree',
          matrixRows: [
            {
              id: 'role_responsibilities_match',
              label: 'My job responsibilities matched what was described at the time of hiring',
              required: true,
            },
            {
              id: 'role_skills_utilization',
              label: 'My role made good use of my skills and abilities',
              required: true,
            },
            {
              id: 'role_goals_clarity',
              label: 'I had clarity on my goals and performance expectations',
              required: true,
            },
            {
              id: 'role_tools_resources',
              label: 'I had the tools, resources and authority to do my job well',
              required: true,
            },
            {
              id: 'role_workload_manageable',
              label: 'My workload was reasonable and manageable',
              required: true,
            },
            {
              id: 'role_meaningful_work',
              label: 'My work was challenging and meaningful',
              required: true,
            },
            {
              id: 'role_induction_helped',
              label: 'The onboarding / induction process helped me settle in',
              required: true,
            },
          ],
          orderIndex: 0,
        },
        {
          id: 'role_liked_most',
          label: 'What did you like most about your job?',
          type: 'textarea',
          required: false,
          orderIndex: 1,
        },
        {
          id: 'role_liked_least',
          label: 'What did you like least about your job?',
          type: 'textarea',
          required: false,
          orderIndex: 2,
        },
      ],
    },

    // Section D: Manager & Team
    {
      id: 'section_d',
      title: 'Section D: Manager & Team',
      description: 'Rate the following on a scale of 1 to 5 (1 = Strongly Disagree, 5 = Strongly Agree)',
      orderIndex: 3,
      questions: [
        {
          id: 'manager_ratings',
          label: 'Your manager and team',
          description: '1 = Strongly Disagree, 5 = Strongly Agree',
          type: 'rating_matrix',
          required: true,
          min: 1,
          max: 5,
          minLabel: 'Strongly Disagree',
          maxLabel: 'Strongly Agree',
          matrixRows: [
            {
              id: 'manager_clear_direction',
              label: 'My manager gave clear direction and regular feedback',
              required: true,
            },
            {
              id: 'manager_respect_fairness',
              label: 'My manager treated me with respect and fairness',
              required: true,
            },
            {
              id: 'manager_recognition',
              label: 'My manager recognised and appreciated my work',
              required: true,
            },
            {
              id: 'manager_career_support',
              label: 'My manager supported my career development',
              required: true,
            },
            {
              id: 'manager_approachable',
              label: 'My manager was approachable and open to suggestions',
              required: true,
            },
            {
              id: 'team_cooperation',
              label: 'There was good teamwork and cooperation within my team',
              required: true,
            },
            {
              id: 'team_coordination_sites',
              label: 'There was good coordination with other departments / sites',
              required: true,
            },
          ],
          orderIndex: 0,
        },
        {
          id: 'manager_comments',
          label: 'Any additional comments about your manager or team (optional)',
          type: 'textarea',
          required: false,
          orderIndex: 1,
        },
      ],
    },

    // Section E: Culture, Growth & Development
    {
      id: 'section_e',
      title: 'Section E: Culture, Growth & Development',
      description: 'Rate the following on a scale of 1 to 5 (1 = Strongly Disagree, 5 = Strongly Agree)',
      orderIndex: 4,
      questions: [
        {
          id: 'culture_ratings',
          label: 'Culture, growth and development',
          description: '1 = Strongly Disagree, 5 = Strongly Agree',
          type: 'rating_matrix',
          required: true,
          min: 1,
          max: 5,
          minLabel: 'Strongly Disagree',
          maxLabel: 'Strongly Agree',
          matrixRows: [
            {
              id: 'culture_values_reflected',
              label: "The company's values and culture were clearly reflected in daily practice",
              required: true,
            },
            {
              id: 'culture_valued_respected',
              label: 'I felt valued and respected as an employee',
              required: true,
            },
            {
              id: 'culture_policies_fair',
              label: 'Company policies were fair and consistently applied',
              required: true,
            },
            {
              id: 'culture_upskill_opportunities',
              label: 'I had opportunities to learn and upskill (training, exposure)',
              required: true,
            },
            {
              id: 'culture_promotions_fair',
              label: 'Promotions and career progression were transparent and fair',
              required: true,
            },
            {
              id: 'culture_safe_environment',
              label: 'I felt safe and free from harassment or discrimination',
              required: true,
            },
            {
              id: 'culture_leadership_communication',
              label: 'Communication from leadership was open and transparent',
              required: true,
            },
            {
              id: 'culture_engagement_activities',
              label: 'Employee engagement activities were meaningful',
              required: true,
            },
          ],
          orderIndex: 0,
        },
        {
          id: 'career_path_comments',
          label: 'Did you see a clear career path for yourself within the organisation? Please explain.',
          type: 'textarea',
          required: false,
          orderIndex: 1,
        },
      ],
    },

    // Section F: Compensation, Benefits & Work Environment
    {
      id: 'section_f',
      title: 'Section F: Compensation, Benefits & Work Environment',
      description: 'Rate the following on a scale of 1 to 5 (1 = Strongly Disagree, 5 = Strongly Agree)',
      orderIndex: 5,
      questions: [
        {
          id: 'compensation_ratings',
          label: 'Compensation, benefits and work environment',
          description: '1 = Strongly Disagree, 5 = Strongly Agree',
          type: 'rating_matrix',
          required: true,
          min: 1,
          max: 5,
          minLabel: 'Strongly Disagree',
          maxLabel: 'Strongly Agree',
          matrixRows: [
            {
              id: 'comp_salary_fair',
              label: 'My salary was fair for the role and responsibilities',
              required: true,
            },
            {
              id: 'comp_benefits_satisfactory',
              label: 'Benefits (insurance, leave, reimbursements, etc.) were satisfactory',
              required: true,
            },
            {
              id: 'comp_payroll_timely',
              label: 'Payroll and HR services were timely and accurate',
              required: true,
            },
            {
              id: 'comp_work_hours_balance',
              label: 'Working hours and leave policy allowed a healthy work-life balance',
              required: true,
            },
            {
              id: 'comp_physical_environment',
              label: 'Physical work environment, facilities and safety measures were adequate',
              required: true,
            },
            {
              id: 'comp_hr_responsive',
              label: 'HR was responsive to my queries and concerns',
              required: true,
            },
          ],
          orderIndex: 0,
        },
        {
          id: 'valued_benefits_comments',
          label: 'Which benefits or policies did you value the most? Which needed improvement?',
          type: 'textarea',
          required: false,
          orderIndex: 1,
        },
      ],
    },

    // Section G: Overall Feedback
    {
      id: 'section_g',
      title: 'Section G: Overall Feedback',
      description: 'High-level reflection on your overall journey with the company.',
      orderIndex: 6,
      questions: [
        {
          id: 'overall_satisfaction',
          label: 'Overall satisfaction with your time here',
          type: 'rating',
          required: true,
          min: 1,
          max: 5,
          minLabel: 'Very Dissatisfied',
          maxLabel: 'Very Satisfied',
          orderIndex: 0,
        },
        {
          id: 'recommend_employer',
          label: 'Would you recommend us as an employer to friends / family?',
          type: 'radio',
          required: true,
          options: ['Yes', 'Maybe', 'No'],
          orderIndex: 1,
        },
        {
          id: 'consider_rejoining',
          label: 'Would you consider rejoining in the future?',
          type: 'radio',
          required: true,
          options: ['Yes', 'Maybe', 'No'],
          orderIndex: 2,
        },
        {
          id: 'retention_suggestions',
          label: 'What could the company have done to retain you?',
          type: 'textarea',
          required: false,
          orderIndex: 3,
        },
        {
          id: 'top_three_improvements',
          label: 'What are the top three things we should change or improve?',
          type: 'textarea',
          required: false,
          orderIndex: 4,
        },
        {
          id: 'general_comments',
          label: 'Any other suggestions or comments you would like to share?',
          type: 'textarea',
          required: false,
          orderIndex: 5,
        },
      ],
    },

    // Section H: Handover & Exit Formalities
    {
      id: 'section_h',
      title: 'Section H: Handover & Exit Formalities',
      description: 'To be completed by the employee (tick to confirm completion).',
      orderIndex: 7,
      questions: [
        {
          id: 'handover_checklist',
          label: 'Please tick all that are completed',
          type: 'checkbox',
          required: false,
          options: [
            'Handover of work / documents completed',
            'Company laptop / equipment returned',
            'ID card and access card returned',
            'System / email access clearance done',
            'Pending expense claims submitted',
            'Departmental / IT / Admin / Finance clearances initiated',
            'Contact details for final settlement shared',
            'Knowledge transfer to successor completed',
          ],
          orderIndex: 0,
        },
        {
          id: 'personal_email',
          label: 'Personal email ID (for post-exit communication)',
          type: 'email',
          required: true,
          orderIndex: 1,
        },
        {
          id: 'personal_phone',
          label: 'Personal mobile number',
          type: 'phone',
          required: true,
          orderIndex: 2,
        },
        {
          id: 'preferred_address',
          label: 'Preferred address for documents (Relieving / Experience letter, Form 16)',
          type: 'textarea',
          required: true,
          orderIndex: 3,
        },
      ],
    },

    // Section I: Declaration
    {
      id: 'section_i',
      title: 'Section I: Declaration',
      description: 'Formal confirmation and electronic acknowledgment.',
      orderIndex: 8,
      questions: [
        {
          id: 'declaration_agreement',
          label: 'Declaration',
          description:
            'I confirm that the information provided above is true and given voluntarily. I understand that my feedback will be used to improve the organisation, and I am aware of my continuing confidentiality obligations as per my employment agreement.',
          type: 'checkbox',
          required: true,
          options: ['I agree to the above declaration'],
          orderIndex: 0,
        },
        {
          id: 'declaration_signature',
          label: 'Full name (as electronic signature)',
          type: 'text',
          required: true,
          orderIndex: 1,
        },
        {
          id: 'declaration_date',
          label: 'Date',
          type: 'date',
          required: true,
          orderIndex: 2,
        },
      ],
    },
  ],
};

