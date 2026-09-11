export interface OptionItem {
  id: string
  label: string
}

export interface OptionGroup {
  id: string
  label: string
  items: OptionItem[]
}

export const OPTION_GROUPS: OptionGroup[] = [
  {
    id: 'domains',
    label: 'Domains',
    items: [
      { id: 'domain:qa-testing', label: 'QA / Testing Engineer' },
      { id: 'domain:software-developer', label: 'Software Developer' },
      { id: 'domain:full-stack', label: 'Full Stack Developer' },
      { id: 'domain:cloud', label: 'Cloud' },
      { id: 'domain:aws', label: 'AWS' },
      { id: 'domain:devops', label: 'DevOps' },
      { id: 'domain:data-engineering', label: 'Data Engineering' },
      { id: 'domain:ai-ml', label: 'AI / Machine Learning' },
    ],
  },
  {
    id: 'skills',
    label: 'Programming / Technical Skills',
    items: [
      { id: 'skill:java', label: 'Java' },
      { id: 'skill:python', label: 'Python' },
      { id: 'skill:javascript', label: 'JavaScript' },
      { id: 'skill:typescript', label: 'TypeScript' },
      { id: 'skill:c', label: 'C' },
      { id: 'skill:cpp', label: 'C++' },
      { id: 'skill:sql', label: 'SQL' },
      { id: 'skill:html', label: 'HTML' },
      { id: 'skill:css', label: 'CSS' },
      { id: 'skill:tailwind', label: 'Tailwind CSS' },
    ],
  },
  {
    id: 'frameworks',
    label: 'Frameworks / Libraries',
    items: [
      { id: 'fw:react', label: 'React' },
      { id: 'fw:nextjs', label: 'Next.js' },
      { id: 'fw:nodejs', label: 'Node.js' },
      { id: 'fw:spring-boot', label: 'Spring Boot' },
      { id: 'fw:express', label: 'Express.js' },
      { id: 'fw:selenium', label: 'Selenium' },
      { id: 'fw:playwright', label: 'Playwright' },
      { id: 'fw:testng', label: 'TestNG' },
      { id: 'fw:cucumber', label: 'Cucumber' },
      { id: 'fw:gherkin', label: 'Gherkin' },
      { id: 'fw:junit', label: 'JUnit' },
    ],
  },
  {
    id: 'testing',
    label: 'Testing',
    items: [
      { id: 'test:manual', label: 'Manual Testing' },
      { id: 'test:automation', label: 'Automation Testing' },
      { id: 'test:api', label: 'API Testing' },
      { id: 'test:ui', label: 'UI Testing' },
      { id: 'test:performance', label: 'Performance Testing' },
      { id: 'test:regression', label: 'Regression Testing' },
      { id: 'test:integration', label: 'Integration Testing' },
    ],
  },
  {
    id: 'tools',
    label: 'Cloud / Tools',
    items: [
      { id: 'tool:aws', label: 'AWS' },
      { id: 'tool:azure', label: 'Azure' },
      { id: 'tool:docker', label: 'Docker' },
      { id: 'tool:git', label: 'Git' },
      { id: 'tool:github', label: 'GitHub' },
      { id: 'tool:ci-cd', label: 'CI/CD' },
    ],
  },
]

const ALL_ITEMS: OptionItem[] = OPTION_GROUPS.flatMap((group) => group.items)

export function findOption(id: string): OptionItem | undefined {
  return ALL_ITEMS.find((item) => item.id === id)
}
